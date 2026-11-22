// Repetición espaciada con FSRS (Free Spaced Repetition Scheduler, v4.5).
// Cada tarjeta guarda:
//   s = estabilidad (días hasta que la probabilidad de recordar baja al 90%)
//   d = dificultad (1 a 10)
// Calificación: 1 = olvidé, 2 = difícil, 3 = bien, 4 = fácil.

const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const RETENTION = 0.9; // queremos repasar cuando quede ~90% de probabilidad de recordar
const DAY = 86400000;
const RELEARN_MS = 10 * 60 * 1000; // si fallas, vuelve en 10 minutos

const clampD = (d) => Math.min(10, Math.max(1, d));
const initD = (g) => clampD(W[4] - (g - 3) * W[5]);

export function retrievability(daysElapsed, s) {
  return Math.pow(1 + FACTOR * daysElapsed / s, DECAY);
}

function intervalDays(s) {
  const days = (s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return Math.min(365, Math.max(1, Math.round(days)));
}

export function review(prev, grade, now = Date.now()) {
  let s, d;
  if (!prev) {
    s = W[grade - 1];
    d = initD(grade);
  } else {
    const t = Math.max(0, (now - prev.last) / DAY);
    const r = retrievability(t, prev.s);
    d = clampD(W[7] * initD(3) + (1 - W[7]) * (prev.d - W[6] * (grade - 3)));
    if (grade === 1) {
      s = Math.min(prev.s,
        W[11] * Math.pow(d, -W[12]) * (Math.pow(prev.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
    } else {
      s = prev.s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(prev.s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) * (grade === 2 ? W[15] : 1) * (grade === 4 ? W[16] : 1));
    }
  }
  return {
    s, d,
    last: now,
    due: grade === 1 ? now + RELEARN_MS : now + intervalDays(s) * DAY,
    reps: (prev?.reps || 0) + 1,
    lapses: (prev?.lapses || 0) + (grade === 1 ? 1 : 0),
  };
}

// Nivel de dominio para mostrar en la interfaz.
export function mastery(cs) {
  if (!cs) return 0;
  if (cs.s >= 21) return 3; // dominada
  if (cs.s >= 4) return 2;  // aprendiendo bien
  return 1;                 // recién vista
}
