// Utilidades pequeñas compartidas por toda la app.

// Crea elementos: h('div', { class: 'x', onclick: fn }, hijo1, 'texto', ...)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Markdown mínimo: ```bloques```, `código`, **negritas**, *cursivas*, saltos de línea.
export function md(text) {
  const blocks = [];
  let s = esc(text ?? '').replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    return `\n\n\u0000${blocks.length - 1}\u0000\n\n`;
  });
  const inline = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    inline.push(`<code>${code}</code>`);
    return `\u0001${inline.length - 1}\u0001`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.split(/\n{2,}/).map((p) => p.trim() ? `<p>${p.trim().replace(/\n/g, '<br>')}</p>` : '').join('');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => inline[i]);
  return s.replace(/<p>\u0000(\d+)\u0000<\/p>|\u0000(\d+)\u0000/g, (_, a, b) => blocks[a ?? b]);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Normaliza para comparar respuestas escritas: sin acentos, mayúsculas, comillas ni espacios extra.
export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/["'`´.]+$/g, '').replace(/^["'`´]+/g, '').replace(/\s+/g, ' ').trim();
}

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayDiff(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* sin vibración */ }
}

export const fmt = (n) => Number(n).toLocaleString('es-MX');
