// Alexandria: pantallas y navegación.
import { h, md, pick, toast, fmt, todayStr } from './util.js';
import { load, save, S, recordAnswer, markSeen, todayCount, currentStreak, replaceState, resetState } from './store.js';
import { QUOTES } from './content/topics.js';
import {
  allTopics, getTopic, getLesson, lessonId, parseLessonId, lessonTitles, availableLessons,
  isLessonDone, isQuestion, topicProgress, nextLessonIndex, dueCardIds, cardById,
} from './library.js';
import { renderCard } from './cards.js';
import { hasKey, connect, listModels, generateLesson, createTopic, ensureFreshContent, isGenerating } from './gemini.js';
import { mastery } from './fsrs.js';

const view = document.getElementById('view');
let token = 0;           // cambia en cada navegación; sirve para cancelar trabajos viejos
let cleanups = [];

const go = (hash) => { location.hash = hash; };
const onLeave = (fn) => cleanups.push(fn);

// ───────────────────────── Piezas comunes ─────────────────────────

const ICONS = {
  inicio: '<path d="M3 9.5 12 4l9 5.5H3Z"/><path d="M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7M3 20h18"/>',
  agora: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 15.5v-7M9.3 11.2 12 8.5l2.7 2.7"/>',
  biblioteca: '<path d="M3.5 20.5h17"/><path d="M5.5 4h3v14h-3zM10 6.5h3V18h-3zM14.6 6.2l2.8-.8 3.3 12-2.8.8z"/>',
  perfil: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c.9-3.9 3.8-6 7-6s6.1 2.1 7 6"/>',
};
const icon = (name) => h('span', { class: 'ico', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>` });

const meander = () => h('div', { class: 'meander', 'aria-hidden': 'true' });

const LAUREL = `<svg viewBox="0 0 120 120" class="laurel" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
<path d="M60 104c-22-4-38-22-38-46 0-10 3-19 8-27"/><path d="M60 104c22-4 38-22 38-46 0-10-3-19-8-27"/></g>
<g fill="currentColor">${[0, 1, 2, 3, 4, 5].map((i) => {
  const a = 200 - i * 22, r = 40, x = 60 + r * Math.cos(a * Math.PI / 180), y = 60 - r * Math.sin(a * Math.PI / 180);
  const x2 = 120 - x;
  return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4" transform="rotate(${(-a + 60).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>
<ellipse cx="${x2.toFixed(1)}" cy="${y.toFixed(1)}" rx="9" ry="4" transform="rotate(${(a - 60).toFixed(0)} ${x2.toFixed(1)} ${y.toFixed(1)})"/>`;
}).join('')}</g></svg>`;

function loadingNode(text) {
  return h('div', { class: 'loading' },
    h('div', { class: 'quill', 'aria-hidden': 'true' }, '✒'),
    h('p', {}, text || 'El escriba está copiando nuevos rollos…'),
    h('p', { class: 'muted small' }, 'Gemini está escribiendo la lección. Tarda unos segundos.'));
}

function noKeyNode() {
  return h('div', { class: 'panel center' },
    h('h2', {}, 'Esta lección aún no está escrita'),
    h('p', { class: 'muted' }, 'Alexandria usa Gemini para escribir lecciones nuevas. Conéctalo una vez y tendrás contenido sin fin.'),
    h('button', { class: 'btn btn-primary', onclick: () => go('#/perfil') }, 'Conectar Gemini'));
}

function errorNode(msg, retry) {
  return h('div', { class: 'panel center' },
    h('h2', {}, 'El rollo se manchó de tinta'),
    h('p', { class: 'muted' }, msg),
    retry && h('button', { class: 'btn btn-primary', onclick: retry }, 'Intentar de nuevo'));
}

function progressBar(frac) {
  return h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: `width:${Math.round(frac * 100)}%` }));
}

// Elige qué lección sugerir: la siguiente del tema menos avanzado que tenga contenido.
function suggestLesson() {
  const opts = allTopics().map((t) => {
    const i = nextLessonIndex(t);
    const titles = lessonTitles(t);
    return { topic: t, index: i, title: titles[i], ready: Boolean(getLesson(lessonId(t.id, i))), done: topicProgress(t).done };
  }).filter((o) => o.title && (o.ready || hasKey()));
  opts.sort((a, b) => (b.ready - a.ready) || (a.done - b.done));
  const best = opts.filter((o) => o.ready === opts[0]?.ready && o.done === opts[0]?.done);
  if (!best.length) return null;
  const day = Number(todayStr().replace(/-/g, ''));
  return best[day % best.length];
}

// ───────────────────────── Inicio ─────────────────────────

function viewHome() {
  const s = S();
  const due = dueCardIds().length;
  const today = todayCount();
  const frac = Math.min(1, today / s.goal);
  const C = 2 * Math.PI * 46;
  const day = Number(todayStr().replace(/-/g, ''));
  const [quote, author] = QUOTES[day % QUOTES.length];
  const next = suggestLesson();

  view.replaceChildren(h('div', { class: 'page home' },
    h('header', { class: 'home-head' },
      h('p', { class: 'greek' }, 'Χαῖρε'),
      h('h1', { class: 'brand' }, 'Alexandria'),
      meander()),

    h('section', { class: 'today' },
      h('div', { class: 'ring', role: 'img', 'aria-label': `Meta de hoy: ${today} de ${s.goal}` ,
        html: `<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" class="ring-bg"/><circle cx="55" cy="55" r="46" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>` },
        h('div', { class: 'ring-label' },
          frac >= 1 ? h('span', { class: 'ring-laurel', html: LAUREL }) : h('strong', {}, today),
          h('span', {}, frac >= 1 ? '¡Meta cumplida!' : `de ${s.goal} hoy`))),
      h('div', { class: 'today-stats' },
        h('div', { class: 'stat' }, h('strong', {}, currentStreak()), h('span', {}, currentStreak() === 1 ? 'día de racha' : 'días de racha')),
        h('div', { class: 'stat' }, h('strong', {}, `${fmt(s.xp)} ₯`), h('span', {}, 'dracmas')),
        h('div', { class: 'stat' }, h('strong', {}, due), h('span', {}, due === 1 ? 'repaso pendiente' : 'repasos pendientes')))),

    h('button', { class: 'cta cta-agora', onclick: () => go('#/agora') },
      h('span', { class: 'cta-kicker' }, 'Ratos cortos'),
      h('span', { class: 'cta-title' }, 'Entrar al Ágora'),
      h('span', { class: 'cta-sub' }, due ? `Tarjetas rápidas · ${due} por repasar` : 'Tarjetas rápidas de todos los temas')),

    next && h('button', { class: 'cta cta-lesson', onclick: () => go(`#/leccion/${encodeURIComponent(lessonId(next.topic.id, next.index))}`) },
      h('span', { class: 'cta-kicker' }, `10–15 min · ${next.topic.name}`),
      h('span', { class: 'cta-title' }, next.title),
      h('span', { class: 'cta-sub' }, next.ready ? 'Continuar en la Biblioteca' : 'Gemini la escribirá para ti')),

    h('figure', { class: 'quote' },
      h('blockquote', {}, `«${quote}»`),
      h('figcaption', {}, author))));
}

// ───────────────────────── Ágora (feed) ─────────────────────────

function viewAgora() {
  const my = token;
  const feed = h('div', { class: 'feed' });
  view.replaceChildren(feed);
  view.classList.add('is-feed');
  onLeave(() => view.classList.remove('is-feed'));

  const sess = { queued: new Set(), lastTopic: null, answered: 0, loading: false, ended: false };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const idx = [...feed.children].indexOf(e.target);
      if (idx >= feed.children.length - 3) fill();
    }
  }, { root: feed, threshold: 0.6 });
  onLeave(() => io.disconnect());

  const slide = (node) => { const sl = h('section', { class: 'slide' }, node); io.observe(sl); return sl; };

  function goNext(from) {
    const n = from.nextElementSibling;
    if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else fill().then(() => from.nextElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function insertAfter(ref, steps, node) {
    let target = ref;
    for (let i = 0; i < steps && target.nextElementSibling; i++) target = target.nextElementSibling;
    feed.insertBefore(node, target.nextElementSibling);
  }

  function cardSlide(card, kind) {
    let sl;
    const el = renderCard(card, {
      label: kind,
      onResult: (correct) => {
        const gained = recordAnswer(card.id, correct);
        sess.answered++;
        if (!correct && kind !== 'Otra vez') insertAfter(sl, 3, cardSlide(card, 'Otra vez'));
        if (sess.answered % 25 === 0) insertAfter(sl, 0, pauseSlide());
        return gained;
      },
      onSeen: () => markSeen(card.id),
      onNext: () => goNext(sl),
    });
    sl = slide(el);
    return sl;
  }

  function pauseSlide() {
    let sl;
    sl = slide(h('div', { class: 'panel center pause' },
      h('div', { class: 'big-glyph', 'aria-hidden': 'true' }, 'Ω'),
      h('h2', {}, `Llevas ${sess.answered} tarjetas`),
      h('p', { class: 'muted' }, 'Buen momento para una pausa: tu cerebro consolida lo aprendido mientras descansas.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost', onclick: () => go('#/inicio') }, 'Terminar por hoy'),
        h('button', { class: 'btn btn-primary', onclick: () => goNext(sl) }, 'Seguir'))));
    return sl;
  }

  function chunkFor(topic) {
    for (const l of availableLessons(topic)) {
      const fresh = (c) => !S().seen[c.id] && !sess.queued.has(c.id);
      const start = l.cards.findIndex(fresh);
      if (start === -1) continue;
      const out = [l.cards[start]];
      for (let k = start + 1; k < l.cards.length && out.length < 4; k++) {
        if (l.cards[k].type === 'concept') break;
        if (fresh(l.cards[k])) out.push(l.cards[k]);
      }
      return out;
    }
    return [];
  }

  // Intercalado: cada bloque nuevo viene de un tema distinto al anterior.
  function nextChunk() {
    const options = allTopics().map((t) => ({ t, ch: chunkFor(t) })).filter((o) => o.ch.length);
    if (!options.length) return [];
    const others = options.filter((o) => o.t.id !== sess.lastTopic);
    const chosen = pick(others.length ? others : options);
    sess.lastTopic = chosen.t.id;
    return chosen.ch;
  }

  function nextItems(n) {
    const out = [];
    const due = dueCardIds().filter((id) => !sess.queued.has(id));
    let di = 0;
    while (out.length < n) {
      let added = false;
      for (let k = 0; k < 2 && di < due.length; k++) {
        const c = cardById(due[di++]);
        sess.queued.add(c.id);
        out.push([c, 'Repaso']);
        added = true;
      }
      for (const c of nextChunk()) { sess.queued.add(c.id); out.push([c, 'Nuevo']); added = true; }
      if (!added) break;
    }
    return out;
  }

  function freeReview(n) {
    const seen = Object.keys(S().cards).filter((id) => !sess.queued.has(id) && cardById(id));
    const out = [];
    while (out.length < n && seen.length) {
      const id = seen.splice(Math.floor(Math.random() * seen.length), 1)[0];
      sess.queued.add(id);
      out.push([cardById(id), 'Repaso libre']);
    }
    return out;
  }

  function endSlide() {
    return slide(h('div', { class: 'panel center' },
      h('div', { class: 'big-glyph', 'aria-hidden': 'true' }, 'Α'),
      h('h2', {}, 'Recorriste todo el Ágora'),
      hasKey()
        ? h('p', { class: 'muted' }, 'Por ahora no hay más tarjetas. Vuelve en un rato o abre una lección en la Biblioteca.')
        : h('p', { class: 'muted' }, 'Ya viste todo el contenido escrito a mano. Conecta Gemini y el Ágora no se acaba nunca.'),
      h('button', { class: 'btn btn-primary', onclick: () => go(hasKey() ? '#/biblioteca' : '#/perfil') },
        hasKey() ? 'Ir a la Biblioteca' : 'Conectar Gemini')));
  }

  async function fill() {
    if (sess.loading || sess.ended || my !== token) return;
    sess.loading = true;
    try {
      let items = nextItems(6);
      if (!items.length) {
        const job = ensureFreshContent();
        if (job) {
          const ld = slide(loadingNode());
          feed.append(ld);
          try { await job; } catch (e) { toast(e.message, 4000); }
          ld.remove();
          if (my !== token) return;
          items = nextItems(6);
        }
      }
      if (!items.length) items = freeReview(5);
      if (!items.length) { feed.append(endSlide()); sess.ended = true; return; }
      for (const [card, kind] of items) feed.append(cardSlide(card, kind));
      ensureFreshContent()?.catch(() => {}); // prepara más contenido en segundo plano
    } finally {
      sess.loading = false;
    }
  }

  fill();
}

// ───────────────────────── Biblioteca ─────────────────────────

function viewLibrary() {
  const input = h('input', {
    class: 'text-input', type: 'text', placeholder: 'Ej. estoicismo, SQL, la Revolución mexicana…',
    enterkeyhint: 'go', autocomplete: 'off', 'aria-label': 'Tema para el Oráculo',
  });
  const btn = h('button', { class: 'btn btn-primary' }, 'Consultar');
  const ask = async () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    if (!hasKey()) { toast('Primero conecta Gemini en Perfil.'); go('#/perfil'); return; }
    btn.disabled = input.disabled = true;
    btn.textContent = 'El Oráculo medita…';
    try {
      const topic = await createTopic(q);
      go(`#/tema/${topic.id}`);
    } catch (e) {
      toast(e.message, 4000);
      btn.disabled = input.disabled = false;
      btn.textContent = 'Consultar';
    }
  };
  btn.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });

  view.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Biblioteca'), h('p', { class: 'muted' }, 'Lecciones de 10–15 minutos, paso a paso.'), meander()),
    h('div', { class: 'topic-grid' }, ...allTopics().map((t) => {
      const p = topicProgress(t);
      return h('button', { class: 'topic-tile', onclick: () => go(`#/tema/${t.id}`) },
        h('span', { class: 'tile-glyph', 'aria-hidden': 'true' }, t.glyph),
        h('span', { class: 'tile-name' }, t.name),
        h('span', { class: 'tile-patron' }, t.patron),
        progressBar(p.done / p.total),
        h('span', { class: 'tile-count' }, `${p.done} de ${p.total} lecciones`));
    })),
    h('section', { class: 'oracle' },
      h('div', { class: 'oracle-head' }, h('span', { class: 'oracle-glyph', 'aria-hidden': 'true' }, '✦'), h('h2', {}, 'Consulta al Oráculo')),
      h('p', { class: 'muted' }, '¿Quieres aprender algo que no está aquí? Escríbelo y se creará un tema completo para ti.'),
      h('div', { class: 'row' }, input, btn))));
}

function viewTopic(id) {
  const topic = getTopic(id);
  if (!topic) return go('#/biblioteca');
  const titles = lessonTitles(topic);
  const p = topicProgress(topic);

  const rows = titles.map((title, i) => {
    const l = getLesson(lessonId(topic.id, i));
    const done = l && isLessonDone(l);
    const status = done ? 'done' : l ? 'ready' : isGenerating(lessonId(topic.id, i)) ? 'busy' : 'new';
    const note = { done: 'Completada', ready: `${l?.cards.length} tarjetas`, busy: 'Escribiéndose…', new: hasKey() ? 'Se escribirá al abrirla' : 'Requiere Gemini' }[status];
    return h('li', {},
      h('button', { class: `lesson-row is-${status}`, onclick: () => go(`#/leccion/${encodeURIComponent(lessonId(topic.id, i))}`) },
        h('span', { class: 'lesson-num' }, done ? '✓' : i + 1),
        h('span', { class: 'lesson-text' }, h('span', { class: 'lesson-title' }, title), h('span', { class: 'lesson-note' }, note))));
  });

  view.replaceChildren(h('div', { class: 'page' },
    h('button', { class: 'back', onclick: () => go('#/biblioteca') }, '‹ Biblioteca'),
    h('header', { class: 'topic-head' },
      h('div', { class: 'topic-glyph', 'aria-hidden': 'true' }, topic.glyph),
      h('h1', {}, topic.name),
      h('p', { class: 'muted' }, h('strong', {}, topic.patron), ` · ${topic.patronNote}`),
      progressBar(p.done / p.total),
      h('p', { class: 'small muted' }, `${p.done} de ${p.total} lecciones completadas`)),
    h('ol', { class: 'lesson-list' }, ...rows),
    hasKey() && p.done >= titles.length - 1 && h('button', {
      class: 'btn btn-ghost wide', onclick: () => go(`#/leccion/${encodeURIComponent(lessonId(topic.id, titles.length))}`),
    }, '+ Escribir una lección más'),
    topic.custom && h('button', {
      class: 'btn btn-danger wide', onclick: () => {
        if (!confirm(`¿Eliminar el tema «${topic.name}» y su progreso?`)) return;
        S().custom = S().custom.filter((t) => t.id !== topic.id);
        for (const k of Object.keys(S().generated)) if (k.startsWith(`${topic.id}:`)) delete S().generated[k];
        for (const k of Object.keys(S().cards)) if (k.startsWith(`${topic.id}:`)) delete S().cards[k];
        save();
        go('#/biblioteca');
      },
    }, 'Eliminar este tema')));
}

// ───────────────────────── Lección ─────────────────────────

async function viewLesson(id) {
  const my = token;
  const { topicId, index } = parseLessonId(id);
  const topic = getTopic(topicId);
  if (!topic) return go('#/biblioteca');
  document.body.classList.add('immersive');
  onLeave(() => document.body.classList.remove('immersive'));

  const fillBar = h('div', { class: 'progress-fill', style: 'width:0%' });
  const stage = h('div', { class: 'lesson-stage' });
  view.replaceChildren(h('div', { class: 'lesson' },
    h('div', { class: 'lesson-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Salir de la lección', onclick: () => go(`#/tema/${topicId}`) }, '✕'),
      h('div', { class: 'progress' }, fillBar)),
    stage));

  let lesson = getLesson(id);
  if (!lesson) {
    if (!hasKey()) { stage.append(noKeyNode()); return; }
    stage.append(loadingNode(`Copiando el rollo «${lessonTitles(topic)[index] || 'nueva lección'}»…`));
    try {
      lesson = await generateLesson(topicId, index);
    } catch (e) {
      if (my === token) stage.replaceChildren(errorNode(e.message, () => viewLesson(id)));
      return;
    }
    if (my !== token) return;
  }

  const queue = [...lesson.cards];
  const firstTry = new Map();
  let pos = 0, earned = 0;

  const show = () => {
    fillBar.style.width = `${Math.round((pos / queue.length) * 100)}%`;
    if (pos >= queue.length) return summary();
    const card = queue[pos];
    const retry = pos >= lesson.cards.length;
    const el = renderCard(card, {
      label: retry ? 'Otra vez' : lesson.title,
      onResult: (correct) => {
        if (!firstTry.has(card.id)) firstTry.set(card.id, correct);
        const g = recordAnswer(card.id, correct);
        earned += g;
        if (!correct && !retry) queue.push(card);
        return g;
      },
      onSeen: () => markSeen(card.id),
      onNext: () => { pos++; show(); },
    });
    el.classList.add('enter');
    stage.replaceChildren(el);
    stage.scrollTop = 0;
  };

  const summary = () => {
    const asked = [...firstTry.values()];
    const right = asked.filter(Boolean).length;
    const titles = lessonTitles(topic);
    const nextId = lessonId(topicId, index + 1);
    const hasNext = index + 1 < titles.length || hasKey();
    stage.replaceChildren(h('div', { class: 'panel center summary enter' },
      h('div', { class: 'summary-laurel', html: LAUREL }),
      h('p', { class: 'kicker' }, 'Lección completada'),
      h('h2', {}, lesson.title),
      h('div', { class: 'summary-stats' },
        h('div', { class: 'stat' }, h('strong', {}, `${right}/${asked.length}`), h('span', {}, 'a la primera')),
        h('div', { class: 'stat' }, h('strong', {}, `+${earned} ₯`), h('span', {}, 'dracmas'))),
      h('p', { class: 'muted small' }, 'Estas tarjetas volverán al Ágora justo antes de que las olvides.'),
      h('div', { class: 'col' },
        hasNext && h('button', { class: 'btn btn-primary', onclick: () => go(`#/leccion/${encodeURIComponent(nextId)}`) },
          `Siguiente: ${titles[index + 1] || 'nueva lección'}`),
        h('button', { class: 'btn btn-ghost', onclick: () => go(`#/tema/${topicId}`) }, `Volver a ${topic.name}`))));
  };

  show();
}

// ───────────────────────── Perfil ─────────────────────────

function viewProfile() {
  const s = S();
  const states = Object.entries(s.cards).filter(([id]) => cardById(id));
  const mastered = states.filter(([, cs]) => mastery(cs) === 3).length;
  const acc = s.stats.answered ? Math.round((s.stats.correct / s.stats.answered) * 100) : 0;

  const segmented = (options, current, onPick) => {
    const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
    for (const [val, label] of options) {
      wrap.append(h('button', {
        class: val === current ? 'on' : '', role: 'radio', 'aria-checked': String(val === current),
        onclick: () => { onPick(val); viewProfile(); },
      }, label));
    }
    return wrap;
  };

  // Gemini
  const keyInput = h('input', {
    class: 'text-input', type: 'password', placeholder: 'Pega aquí tu API key', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'API key de Gemini',
  });
  const connectBtn = h('button', { class: 'btn btn-primary' }, 'Conectar');
  connectBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { keyInput.focus(); return; }
    connectBtn.disabled = true;
    connectBtn.textContent = 'Probando…';
    try {
      const { model } = await connect(key);
      toast(`Conectado · ${model}`);
      viewProfile();
    } catch (e) {
      toast(e.message, 4500);
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar';
    }
  });

  const modelSelect = h('select', { class: 'select', 'aria-label': 'Modelo de Gemini' }, h('option', { value: s.settings.model }, s.settings.model || '—'));
  let modelsLoaded = false;
  modelSelect.addEventListener('focus', async () => {
    if (modelsLoaded) return;
    modelsLoaded = true;
    try {
      const names = (await listModels()).filter((n) => n.startsWith('gemini'));
      modelSelect.replaceChildren(...names.map((n) => h('option', { value: n, selected: n === s.settings.model }, n)));
    } catch (e) { toast(e.message); }
  });
  modelSelect.addEventListener('change', () => { s.settings.model = modelSelect.value; save(); toast(`Modelo: ${modelSelect.value}`); });

  const gemini = hasKey()
    ? h('div', {},
      h('p', { class: 'status-ok' }, '● Conectado'),
      h('label', { class: 'field' }, h('span', {}, 'Modelo'), modelSelect),
      h('p', { class: 'small muted' }, 'Se eligió automáticamente el modelo "flash" más reciente: rápido y con nivel gratuito.'),
      h('button', { class: 'btn btn-ghost', onclick: () => {
        if (!confirm('¿Quitar la API key de este dispositivo?')) return;
        s.settings.apiKey = ''; s.settings.model = ''; save(); viewProfile();
      } }, 'Quitar API key'))
    : h('div', {},
      h('ol', { class: 'steps' },
        h('li', {}, 'Entra a ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'aistudio.google.com/apikey'), ' con tu cuenta de Google.'),
        h('li', {}, 'Toca «Create API key» (Crear clave de API). Si te lo pide, crea un proyecto nuevo.'),
        h('li', {}, 'Copia la clave (empieza con «AIza…») y pégala aquí abajo.')),
      h('div', { class: 'row' }, keyInput, connectBtn),
      h('p', { class: 'small muted' }, 'Tu clave se guarda solo en este dispositivo y las peticiones van directo a Google. No la compartas con nadie.'));

  // Respaldo
  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || !data.cards) throw new Error();
      if (!confirm('Esto reemplazará tu progreso actual con el del respaldo. ¿Continuar?')) return;
      data.settings = { ...data.settings, apiKey: s.settings.apiKey, model: s.settings.model };
      replaceState(data);
      toast('Respaldo restaurado');
      viewProfile();
    } catch { toast('Ese archivo no es un respaldo válido.'); }
  });
  const exportData = () => {
    const data = JSON.parse(JSON.stringify(S()));
    data.settings.apiKey = '';
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `alexandria-respaldo-${todayStr()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  view.replaceChildren(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', {}, 'Perfil'), meander()),
    h('section', { class: 'stat-grid' },
      ...[[`${fmt(s.xp)} ₯`, 'dracmas'], [currentStreak(), 'días de racha'], [fmt(s.stats.answered), 'respuestas'],
        [`${acc}%`, 'precisión'], [states.length, 'tarjetas en tu memoria'], [mastered, 'dominadas']]
        .map(([v, l]) => h('div', { class: 'stat' }, h('strong', {}, v), h('span', {}, l)))),

    h('section', { class: 'panel' },
      h('h2', {}, 'Meta diaria'),
      h('p', { class: 'small muted' }, 'Tarjetas respondidas al día.'),
      segmented([[10, '10 · ligera'], [20, '20 · normal'], [40, '40 · intensa']], s.goal, (v) => { s.goal = v; save(); })),

    h('section', { class: 'panel' },
      h('h2', {}, 'Apariencia'),
      segmented([['auto', 'Automática'], ['light', 'Mármol'], ['dark', 'Noche']], s.settings.theme, (v) => { s.settings.theme = v; save(); applyTheme(); })),

    h('section', { class: 'panel' }, h('h2', {}, 'Gemini'), gemini),

    h('section', { class: 'panel' },
      h('h2', {}, 'Cómo aprende Alexandria'),
      h('div', { class: 'science', html: md(
        '**Repetición espaciada (FSRS).** Cada tarjeta que respondes vuelve justo antes de que la olvides. Si aciertas, el intervalo crece; si fallas, vuelve pronto.\n\n' +
        '**Práctica de recuperación.** Casi todo son preguntas: esforzarte por recordar fija la memoria mucho más que releer.\n\n' +
        '**Intercalado.** El Ágora mezcla temas; cuesta un poco más, pero se aprende mejor que estudiando un solo tema en bloque.\n\n' +
        '**Feedback inmediato.** Cada respuesta explica el porqué, y lo que fallas se repite unos minutos después.') })),

    h('section', { class: 'panel' },
      h('h2', {}, 'Respaldo'),
      h('p', { class: 'small muted' }, 'Tu progreso vive en este dispositivo. Descarga un respaldo de vez en cuando, sobre todo antes de cambiar de teléfono.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost', onclick: exportData }, 'Descargar respaldo'),
        h('button', { class: 'btn btn-ghost', onclick: () => fileInput.click() }, 'Restaurar')),
      fileInput),

    h('button', { class: 'btn btn-danger wide', onclick: () => {
      if (!confirm('¿Borrar todo tu progreso? Esto no se puede deshacer.')) return;
      resetState(); toast('Progreso reiniciado'); viewProfile();
    } }, 'Reiniciar progreso')));
}

// ───────────────────────── Navegación ─────────────────────────

function applyTheme() {
  const t = S().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

const ROUTES = { inicio: viewHome, agora: viewAgora, biblioteca: viewLibrary, tema: viewTopic, leccion: viewLesson, perfil: viewProfile };
const TAB_FOR = { inicio: 'inicio', agora: 'agora', biblioteca: 'biblioteca', tema: 'biblioteca', leccion: 'biblioteca', perfil: 'perfil' };

function route() {
  token++;
  cleanups.splice(0).forEach((fn) => fn());
  const [name = 'inicio', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const key = ROUTES[name] ? name : 'inicio';
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  document.querySelectorAll('#tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === TAB_FOR[key] ? 'page' : 'false'));
  ROUTES[key](...args.map(decodeURIComponent));
}

function buildTabbar() {
  const tabs = [['inicio', 'Inicio'], ['agora', 'Ágora'], ['biblioteca', 'Biblioteca'], ['perfil', 'Perfil']];
  document.getElementById('tabbar').replaceChildren(...tabs.map(([id, label]) =>
    h('a', { href: `#/${id}`, 'data-tab': id }, icon(id), h('span', {}, label))));
}

load();
applyTheme();
buildTabbar();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
