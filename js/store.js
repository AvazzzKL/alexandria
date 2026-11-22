// Todo tu progreso vive en este dispositivo (localStorage).
import { review } from './fsrs.js';
import { todayStr, dayDiff } from './util.js';

const KEY = 'alexandria-v1';

const defaults = () => ({
  version: 1,
  cards: {},        // id de tarjeta → estado FSRS
  seen: {},         // id de tarjeta → 1 si ya la viste
  xp: 0,            // dracmas
  streak: { count: 0, last: null },
  daily: { date: null, count: 0 },
  goal: 20,
  stats: { answered: 0, correct: 0 },
  settings: { apiKey: '', model: '', theme: 'auto' },
  generated: {},    // id de lección → { title, cards, at }
  custom: [],       // temas creados con el Oráculo
});

let state = defaults();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...defaults(), ...saved, settings: { ...defaults().settings, ...saved.settings } };
    }
  } catch (e) {
    console.warn('No se pudo leer el progreso', e);
  }
  navigator.storage?.persist?.().catch(() => {});
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar el progreso', e);
  }
}

export const S = () => state;

export function replaceState(next) {
  state = { ...defaults(), ...next, settings: { ...defaults().settings, ...next.settings } };
  save();
}

export function resetState() {
  const keep = { apiKey: state.settings.apiKey, model: state.settings.model, theme: state.settings.theme };
  state = defaults();
  state.settings = { ...state.settings, ...keep };
  save();
}

function touchDay() {
  const today = todayStr();
  if (state.daily.date !== today) state.daily = { date: today, count: 0 };
  if (state.streak.last !== today) {
    const gap = state.streak.last ? dayDiff(state.streak.last, today) : null;
    state.streak.count = gap === 1 ? state.streak.count + 1 : 1;
    state.streak.last = today;
  }
}

export function todayCount() {
  return state.daily.date === todayStr() ? state.daily.count : 0;
}

export function currentStreak() {
  if (!state.streak.last) return 0;
  return dayDiff(state.streak.last, todayStr()) <= 1 ? state.streak.count : 0;
}

// Registra una respuesta. Devuelve las dracmas ganadas.
export function recordAnswer(cardId, correct) {
  touchDay();
  state.cards[cardId] = review(state.cards[cardId], correct ? 3 : 1);
  state.seen[cardId] = 1;
  state.stats.answered++;
  if (correct) state.stats.correct++;
  state.daily.count++;
  const gained = correct ? 10 : 2;
  state.xp += gained;
  save();
  return gained;
}

export function markSeen(cardId) {
  if (state.seen[cardId]) return;
  state.seen[cardId] = 1;
  save();
}
