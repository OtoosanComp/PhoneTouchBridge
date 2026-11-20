// Proveedor Gemini del servidor (Netlify). La lógica pura vive en src/ y la comparte la app (llamada directa desde el teléfono).
export * from '../../../src/card-intelligence/gemini-shared.mjs';

/** Tiempo total (ms) que la función espera a Gemini antes de responder un error claro. Ajustable con GEMINI_TIME_BUDGET_MS. */
export function geminiTimeBudgetMs(value = process.env.GEMINI_TIME_BUDGET_MS) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(24_000, Math.max(1_000, Math.round(n))) : 8_500;
}
