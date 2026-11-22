// Conexión con Gemini (Google AI Studio). La llave se guarda solo en este dispositivo
// y las peticiones van directo de tu teléfono a Google.
import { S, save } from './store.js';
import { validateCard } from './cards.js';
import { getTopic, lessonId, lessonTitles, getLesson, invalidate, allTopics, unseenCount, availableLessons } from './library.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODEL = 'gemini-flash-latest';

const SYSTEM = `Eres el autor de contenido de Alexandria, una app de microaprendizaje en español (México) inspirada en la Biblioteca de Alejandría.
Escribes lecciones cortas e interactivas basadas en ciencia del aprendizaje:
- Una sola idea por tarjeta. Concreto, claro y con ejemplos cotidianos.
- Práctica de recuperación: la mayoría de las tarjetas son preguntas que obligan a pensar, no a reconocer.
- Las explicaciones enseñan el PORQUÉ en 1 o 2 frases, sin repetir la pregunta.
- Dificultad progresiva dentro de la lección.
- Exactitud ante todo: no inventes datos, fechas ni citas. Si no estás seguro de un dato, no lo uses.
- Nada de LaTeX: usa símbolos Unicode (², √, π, ×, ÷, ≈, ≤).
- Puedes usar **negritas**, \`código\` y bloques \`\`\` para código.
- Distractores plausibles en opción múltiple (errores típicos reales), todos de longitud parecida.
Responde SOLO con JSON válido.`;

const SCHEMA = `Formatos de tarjeta permitidos (usa exactamente estas claves):
{"type":"concept","title":"Título corto","body":"Explicación de 40 a 90 palabras"}
{"type":"mcq","q":"Pregunta","options":["A","B","C","D"],"answer":0,"explain":"Por qué"}   // answer = índice de la opción correcta
{"type":"tf","q":"Afirmación","answer":true,"explain":"Por qué"}
{"type":"fill","q":"Frase con ___ en el hueco","answer":"respuesta corta (1-2 palabras o un número)","accept":["variantes válidas"],"explain":"Por qué"}
{"type":"order","q":"Instrucción de ordenar","items":["primero","segundo","tercero","cuarto"],"explain":"Por qué"}   // items EN EL ORDEN CORRECTO, de 3 a 5
{"type":"slider","q":"Pregunta de estimación numérica","min":0,"max":100,"step":1,"answer":42,"tolerance":2,"unit":"km","explain":"Por qué"}`;

const LESSON_RULES = `Reglas de la lección:
- Entre 8 y 10 tarjetas.
- Empieza con un "concept". Máximo 3 "concept" en total, cada uno seguido de 2 o 3 preguntas sobre él.
- Usa al menos 4 tipos de pregunta distintos.
- Las respuestas "fill" deben ser inequívocas.
- La posición de la respuesta correcta en "mcq" debe variar.`;

export function hasKey() { return Boolean(S().settings.apiKey); }

async function apiError(res) {
  let msg = '';
  try { msg = (await res.json())?.error?.message || ''; } catch { /* sin cuerpo */ }
  if (res.status === 400 && /api key/i.test(msg)) return new Error('La API key no es válida. Revísala en Perfil.');
  if (res.status === 403) return new Error('Google rechazó la API key (permiso denegado).');
  if (res.status === 404) return new Error('El modelo elegido no existe. Vuelve a probar la conexión en Perfil.');
  if (res.status === 429) return new Error('Se alcanzó el límite gratuito de Gemini por ahora. Intenta en un rato.');
  if (res.status >= 500) return new Error('Gemini está saturado en este momento. Intenta de nuevo.');
  return new Error(msg || `Error ${res.status} de Gemini`);
}

export async function listModels(key = S().settings.apiKey) {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
}

// Elige el mejor modelo "flash" disponible: rápido, barato y con nivel gratuito.
export function pickModel(names) {
  if (names.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  const bad = /lite|image|tts|audio|live|embedding|8b|exp|thinking|vision|learnlm|robotics|computer/;
  const scored = names
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !bad.test(n))
    .map((n) => ({ n, v: parseFloat(n.match(/^gemini-([\d.]+)/)[1]), stable: !/preview/.test(n) }))
    .sort((a, b) => (b.v - a.v) || (b.stable - a.stable) || (a.n.length - b.n.length));
  return scored[0]?.n || names.find((n) => n.includes('flash')) || names[0] || FALLBACK_MODEL;
}

export async function connect(key) {
  const names = await listModels(key);
  const model = pickModel(names);
  S().settings.apiKey = key;
  S().settings.model = model;
  save();
  return { model, names };
}

async function generateJSON(prompt) {
  const { apiKey, model } = S().settings;
  if (!apiKey) throw new Error('Configura tu API key de Gemini en Perfil.');
  const res = await fetch(`${BASE}/models/${model || FALLBACK_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    }),
  });
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini no devolvió contenido. Intenta de nuevo.');
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Gemini devolvió un formato inesperado. Intenta de nuevo.');
  }
}

function cleanCards(cards) {
  const out = (Array.isArray(cards) ? cards : []).map(validateCard).filter(Boolean);
  if (out.filter((c) => c.type !== 'concept').length < 3) throw new Error('El contenido generado no pasó la revisión. Intenta de nuevo.');
  return out;
}

const busy = new Map();
export const isGenerating = (id) => busy.has(id);
export const anyGenerating = () => busy.size > 0;

// Genera (o devuelve si ya existe) la lección `index` de un tema.
export function generateLesson(topicId, index) {
  const id = lessonId(topicId, index);
  const existing = getLesson(id);
  if (existing) return Promise.resolve(existing);
  if (busy.has(id)) return busy.get(id);
  const job = (async () => {
    const topic = getTopic(topicId);
    const titles = lessonTitles(topic);
    const title = titles[index];
    const before = titles.slice(0, index);
    const prompt = `Tema general: ${topic.name}${topic.description ? ` (${topic.description})` : ''}.
${title ? `Lección: "${title}".` : `Elige tú el siguiente tema lógico para continuar el temario y ponle un título corto.`}
Lecciones anteriores del temario: ${before.length ? before.join('; ') : 'ninguna (es la primera)'}.
Nivel: principiante curioso; puedes apoyarte en lo visto en lecciones anteriores.

${SCHEMA}

${LESSON_RULES}

Devuelve: {"title":"Título de la lección","cards":[...]}`;
    const data = await generateJSON(prompt);
    const cards = cleanCards(data.cards);
    S().generated[id] = { title: title || String(data.title || 'Nueva lección').slice(0, 80), cards, at: Date.now() };
    save();
    invalidate();
    return getLesson(id);
  })().finally(() => busy.delete(id));
  busy.set(id, job);
  return job;
}

// El Oráculo: crea un tema nuevo a partir de lo que escribas.
export async function createTopic(request) {
  const prompt = `La persona quiere aprender sobre: "${request}".
Diseña un tema de estudio para la app.
- "name": nombre corto del tema (máx. 28 caracteres).
- "description": una frase que delimite el tema.
- "glyph": UNA sola letra griega mayúscula que lo represente (por ejemplo Δ, Θ, Ω).
- "syllabus": 8 títulos de lección cortos, de lo básico a lo avanzado.
- "lesson": la primera lección completa.

${SCHEMA}

${LESSON_RULES}

Devuelve: {"name":"...","description":"...","glyph":"Δ","syllabus":["..."],"lesson":{"title":"...","cards":[...]}}`;
  const data = await generateJSON(prompt);
  const syllabus = (Array.isArray(data.syllabus) ? data.syllabus : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
  if (syllabus.length < 3) throw new Error('El Oráculo dio una respuesta confusa. Intenta de nuevo.');
  const cards = cleanCards(data.lesson?.cards);
  const id = `c${Date.now().toString(36)}`;
  const glyph = [...String(data.glyph || '✦').trim()][0] || '✦';
  const topic = {
    id, name: String(data.name || request).slice(0, 40), glyph,
    description: String(data.description || ''),
    patron: 'El Oráculo', patronNote: String(data.description || 'Un tema que pediste tú.'),
    syllabus, custom: true,
  };
  S().custom.push(topic);
  S().generated[lessonId(id, 0)] = { title: syllabus[0], cards, at: Date.now() };
  save();
  invalidate();
  return topic;
}

// Para el Ágora: si se acaba el contenido nuevo, prepara otra lección en segundo plano.
export function ensureFreshContent(min = 12) {
  if (!hasKey() || anyGenerating() || unseenCount() >= min) return null;
  const topics = allTopics();
  const topic = topics
    .map((t) => ({ t, n: availableLessons(t).length, r: Math.random() }))
    .sort((a, b) => (a.n - b.n) || (a.r - b.r))[0]?.t;
  if (!topic) return null;
  const titles = lessonTitles(topic);
  let index = titles.findIndex((_, i) => !getLesson(lessonId(topic.id, i)));
  if (index === -1) index = titles.length;
  return generateLesson(topic.id, index);
}
