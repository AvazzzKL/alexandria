// Acceso al contenido: temas, lecciones y tarjetas (escritas a mano + generadas).
import { TOPICS } from './content/topics.js';
import { BASE_LESSONS } from './content/lessons.js';
import { S } from './store.js';

let cache = new Map();
export const invalidate = () => { cache = new Map(); };

export const allTopics = () => [...TOPICS, ...S().custom];
export const getTopic = (id) => allTopics().find((t) => t.id === id);
export const lessonId = (topicId, i) => `${topicId}:${i}`;

export function parseLessonId(id) {
  const k = id.lastIndexOf(':');
  return { topicId: id.slice(0, k), index: Number(id.slice(k + 1)) };
}

function rawLesson(id) {
  const { topicId, index } = parseLessonId(id);
  return BASE_LESSONS[topicId]?.[index] || S().generated[id] || null;
}

// Títulos del temario, más las lecciones extra que se hayan generado después.
export function lessonTitles(topic) {
  const titles = [...topic.syllabus];
  for (let i = titles.length; S().generated[lessonId(topic.id, i)]; i++) {
    titles.push(S().generated[lessonId(topic.id, i)].title);
  }
  return titles;
}

export function getLesson(id) {
  if (cache.has(id)) return cache.get(id);
  const raw = rawLesson(id);
  if (!raw) return null;
  const { topicId, index } = parseLessonId(id);
  const lesson = {
    id, topicId, index, title: raw.title,
    cards: raw.cards.map((c, i) => ({ ...c, id: `${id}#${i}`, lessonId: id, topicId })),
  };
  cache.set(id, lesson);
  return lesson;
}

export function cardById(cid) {
  const k = cid.lastIndexOf('#');
  return getLesson(cid.slice(0, k))?.cards[Number(cid.slice(k + 1))] || null;
}

export function availableLessons(topic) {
  return lessonTitles(topic).map((_, i) => getLesson(lessonId(topic.id, i))).filter(Boolean);
}

export const isLessonDone = (l) => l.cards.every((c) => S().seen[c.id]);
export const isQuestion = (c) => c.type !== 'concept';

export function topicProgress(topic) {
  const titles = lessonTitles(topic);
  const done = availableLessons(topic).filter(isLessonDone).length;
  return { done, total: titles.length };
}

// Siguiente lección sin terminar de un tema (o la primera sin contenido).
export function nextLessonIndex(topic) {
  const titles = lessonTitles(topic);
  for (let i = 0; i < titles.length; i++) {
    const l = getLesson(lessonId(topic.id, i));
    if (!l || !isLessonDone(l)) return i;
  }
  return titles.length;
}

export function unseenCount() {
  let n = 0;
  for (const t of allTopics()) for (const l of availableLessons(t)) for (const c of l.cards) if (!S().seen[c.id]) n++;
  return n;
}

export function dueCardIds(now = Date.now()) {
  return Object.entries(S().cards)
    .filter(([id, cs]) => cs.due <= now && cardById(id))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}
