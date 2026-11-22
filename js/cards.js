// Tarjetas interactivas. Cada tipo sabe dibujarse y calificarse solo.
//   concept  → explicación breve
//   mcq      → opción múltiple
//   tf       → verdadero / falso
//   fill     → escribir la respuesta
//   order    → ordenar elementos
//   slider   → estimar un número
import { h, md, shuffle, normalize, pick, buzz, fmt } from './util.js';
import { getTopic } from './library.js';

const PRAISE = ['¡Bien!', '¡Exacto!', '¡Eso es!', '¡Así se hace!', 'Correcto', '¡Muy bien!'];
const COMFORT = ['Casi', 'No exactamente', 'Ahora ya lo sabes', 'Buen intento'];

const fmtVal = (v, unit = '') =>
  unit === '$' ? `$${fmt(v)}` : `${fmt(v)}${unit ? ' ' + unit : ''}`;

export function renderCard(card, opts = {}) {
  const topic = getTopic(card.topicId);
  const el = h('article', { class: `card card-${card.type}` },
    h('div', { class: 'card-meta' },
      h('span', { class: 'glyph', 'aria-hidden': 'true' }, topic?.glyph || '✦'),
      h('span', { class: 'meta-name' }, topic?.name || ''),
      opts.label && h('span', { class: 'tag' }, opts.label)));
  const body = h('div', { class: 'card-body' });
  const foot = h('div', { class: 'card-foot' });
  el.append(body, foot);

  const nextBtn = () => h('button', { class: 'btn btn-primary btn-next', onclick: () => opts.onNext?.() },
    opts.nextLabel || 'Continuar');

  let done = false;
  function finish(correct, reveal) {
    if (done) return;
    done = true;
    el.classList.add(correct ? 'is-right' : 'is-wrong');
    buzz(correct ? 12 : [30, 50, 30]);
    const gained = opts.onResult?.(correct);
    const fb = h('div', { class: `feedback ${correct ? 'ok' : 'bad'}`, role: 'status' },
      h('div', { class: 'fb-head' },
        h('strong', {}, correct ? pick(PRAISE) : pick(COMFORT)),
        gained ? h('span', { class: 'xp-float' }, `+${gained} ₯`) : null),
      reveal && h('p', { class: 'reveal' }, reveal),
      card.explain && h('div', { class: 'fb-explain', html: md(card.explain) }));
    body.append(fb);
    foot.replaceChildren(nextBtn());
    requestAnimationFrame(() => fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  const question = (text) => h('div', { class: 'q', html: md(text) });

  switch (card.type) {
    case 'concept': {
      body.append(h('h2', { class: 'concept-title' }, card.title), h('div', { class: 'concept-body', html: md(card.body) }));
      foot.append(h('button', {
        class: 'btn btn-primary btn-next',
        onclick: () => { opts.onSeen?.(); opts.onNext?.(); },
      }, opts.conceptLabel || 'Entendido'));
      break;
    }

    case 'mcq': {
      body.append(question(card.q));
      const list = h('div', { class: 'options' });
      const order = shuffle(card.options.map((_, i) => i));
      const buttons = order.map((i) => h('button', {
        class: 'option', html: md(card.options[i]),
        onclick: () => {
          if (done) return;
          buttons.forEach((b) => b.disabled = true);
          const correct = i === card.answer;
          buttons[order.indexOf(card.answer)].classList.add('good');
          if (!correct) buttons[order.indexOf(i)].classList.add('bad');
          finish(correct);
        },
      }));
      list.append(...buttons);
      body.append(list);
      break;
    }

    case 'tf': {
      body.append(question(card.q));
      const row = h('div', { class: 'options tf' });
      const make = (val, label) => h('button', {
        class: 'option', onclick: (e) => {
          if (done) return;
          [...row.children].forEach((b) => b.disabled = true);
          const correct = val === card.answer;
          e.currentTarget.classList.add(correct ? 'good' : 'bad');
          if (!correct) [...row.children][card.answer ? 0 : 1].classList.add('good');
          finish(correct);
        },
      }, label);
      row.append(make(true, 'Verdadero'), make(false, 'Falso'));
      body.append(row);
      break;
    }

    case 'fill': {
      const q = question(card.q.includes('___') ? card.q : `${card.q} ___`);
      q.innerHTML = q.innerHTML.replace(/_{3,}/g, '<span class="blank">?</span>');
      const numeric = /^-?[\d.,]+$/.test(String(card.answer));
      const input = h('input', {
        class: 'fill-input', type: 'text', placeholder: 'Escribe tu respuesta',
        inputmode: numeric ? 'decimal' : 'text', autocomplete: 'off', autocapitalize: 'off',
        autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Tu respuesta',
      });
      const check = () => {
        if (done) return;
        const v = input.value.trim();
        if (!v) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); return; }
        const accepted = [card.answer, ...(card.accept || [])].map(String);
        const num = (s) => Number(String(s).replace(/,/g, ''));
        const correct = accepted.some((a) => normalize(a) === normalize(v) ||
          (numeric && !Number.isNaN(num(v)) && num(v) === num(a)));
        input.disabled = true;
        input.classList.add(correct ? 'good' : 'bad');
        const blank = q.querySelector('.blank');
        if (blank) blank.textContent = card.answer;
        finish(correct, correct ? null : `Respuesta: ${card.answer}`);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      body.append(q, input);
      foot.append(
        h('button', { class: 'btn btn-ghost', onclick: () => { if (!done) { input.disabled = true; const b = q.querySelector('.blank'); if (b) b.textContent = card.answer; finish(false, `Respuesta: ${card.answer}`); } } }, 'No lo sé'),
        h('button', { class: 'btn btn-primary', onclick: check }, 'Comprobar'));
      break;
    }

    case 'order': {
      body.append(question(card.q), h('p', { class: 'hint' }, 'Toca los elementos en el orden correcto.'));
      let pool = shuffle(card.items);
      for (let t = 0; t < 6 && pool.join('|') === card.items.join('|'); t++) pool = shuffle(card.items);
      const seq = [];
      const answer = h('ol', { class: 'order-answer' });
      const poolEl = h('div', { class: 'order-pool' });
      const checkBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => {
        if (done) return;
        const correct = seq.join('|') === card.items.join('|');
        [...answer.children].forEach((li, i) => li.classList.add(seq[i] === card.items[i] ? 'good' : 'bad'));
        finish(correct, correct ? null : `Orden correcto: ${card.items.join(' → ')}`);
      } }, 'Comprobar');
      const draw = () => {
        answer.replaceChildren(...seq.map((item, i) => h('li', {
          class: 'chip placed', onclick: () => { if (done) return; seq.splice(i, 1); pool.push(item); draw(); },
        }, h('span', { class: 'num' }, i + 1), item)));
        if (!seq.length) answer.append(h('li', { class: 'order-empty' }, 'Tu orden aparecerá aquí'));
        poolEl.replaceChildren(...pool.map((item, i) => h('button', {
          class: 'chip', onclick: () => { if (done) return; pool.splice(i, 1); seq.push(item); draw(); },
        }, item)));
        checkBtn.disabled = seq.length !== card.items.length;
      };
      draw();
      body.append(answer, poolEl);
      foot.append(checkBtn);
      break;
    }

    case 'slider': {
      body.append(question(card.q));
      const steps = Math.round((card.max - card.min) / card.step);
      let value = card.min + Math.round(steps / 2) * card.step;
      const out = h('output', { class: 'slider-value' }, fmtVal(value, card.unit));
      const range = h('input', {
        type: 'range', class: 'slider', min: card.min, max: card.max, step: card.step, value,
        'aria-label': 'Tu estimación',
      });
      range.addEventListener('input', () => { value = Number(range.value); out.textContent = fmtVal(value, card.unit); });
      body.append(out, range, h('div', { class: 'slider-scale' },
        h('span', {}, fmtVal(card.min, card.unit)), h('span', {}, fmtVal(card.max, card.unit))));
      foot.append(h('button', { class: 'btn btn-primary', onclick: () => {
        if (done) return;
        range.disabled = true;
        const correct = Math.abs(value - card.answer) <= card.tolerance;
        finish(correct, `Respuesta: ${fmtVal(card.answer, card.unit)}${correct ? '' : ` · tú: ${fmtVal(value, card.unit)}`}`);
      } }, 'Responder'));
      break;
    }

    default:
      body.append(h('p', {}, 'Tarjeta desconocida.'));
      foot.append(nextBtn());
  }
  return el;
}

// Limpia y valida una tarjeta que viene de la IA. Devuelve null si no sirve.
export function validateCard(c) {
  if (!c || typeof c !== 'object') return null;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const explain = str(c.explain) || '';
  const num = (v) => (typeof v === 'number' ? v : Number(v));
  switch (c.type) {
    case 'concept': {
      const title = str(c.title), body = str(c.body);
      return title && body ? { type: 'concept', title, body } : null;
    }
    case 'mcq': {
      const q = str(c.q);
      const options = Array.isArray(c.options) ? c.options.map(str).filter(Boolean) : [];
      let answer = c.answer;
      if (typeof answer === 'string' && !/^\d+$/.test(answer)) answer = options.indexOf(answer.trim());
      answer = Number(answer);
      if (!q || options.length < 2 || options.length > 5 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      if (new Set(options).size !== options.length) return null;
      return { type: 'mcq', q, options, answer, explain };
    }
    case 'tf': {
      const q = str(c.q);
      let a = c.answer;
      if (typeof a === 'string') a = ['true', 'verdadero', 'v', 'si', 'sí'].includes(a.toLowerCase().trim());
      return q && typeof a === 'boolean' ? { type: 'tf', q, answer: a, explain } : null;
    }
    case 'fill': {
      const q = str(c.q);
      const answer = c.answer != null ? String(c.answer).trim() : '';
      if (!q || !answer) return null;
      const accept = Array.isArray(c.accept) ? c.accept.map((x) => String(x).trim()).filter(Boolean) : [];
      return { type: 'fill', q, answer, accept, explain };
    }
    case 'order': {
      const q = str(c.q);
      const items = Array.isArray(c.items) ? c.items.map(str).filter(Boolean) : [];
      if (!q || items.length < 2 || items.length > 6 || new Set(items).size !== items.length) return null;
      return { type: 'order', q, items, explain };
    }
    case 'slider': {
      const q = str(c.q);
      const min = num(c.min), max = num(c.max), answer = num(c.answer);
      let step = num(c.step), tolerance = num(c.tolerance);
      if (!q || ![min, max, answer].every(Number.isFinite) || min >= max || answer < min || answer > max) return null;
      if (!Number.isFinite(step) || step <= 0) step = (max - min) / 100;
      if (!Number.isFinite(tolerance) || tolerance < 0) tolerance = step;
      return { type: 'slider', q, min, max, step, answer, tolerance, unit: str(c.unit) || '', explain };
    }
    default:
      return null;
  }
}
