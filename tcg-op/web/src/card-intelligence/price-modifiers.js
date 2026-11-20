import { getMetadata, setMetadata } from './database.js';

/**
 * Ajustes MANUALES del propietario. No son datos de mercado: son factores que multiplican la cotización base
 * de la impresión (YGOPRODeck no distingue 1st Edition / Unlimited). Se pueden editar en "Ajustes de precio".
 */
export const DEFAULT_MODIFIERS = Object.freeze({
  'Yu-Gi-Oh!': Object.freeze({ 'Unlimited': 1, '1st Edition': 1.5, 'Limited Edition': 1.2, 'Collector Tin': 1 }),
  'Riftbound': Object.freeze({ 'Normal': 1, 'Foil': 2, 'Alternate Art': 1 }),
  language: Object.freeze({ EN: 1, ES: 1 })
});

const clean = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0.1 && n <= 50 ? Math.round(n * 100) / 100 : fallback;
};

export function mergeModifiers(saved) {
  const out = { 'Yu-Gi-Oh!': {}, 'Riftbound': {}, language: {} };
  for (const group of Object.keys(out)) {
    for (const [key, base] of Object.entries(DEFAULT_MODIFIERS[group])) out[group][key] = clean(saved?.[group]?.[key], base);
  }
  return out;
}

export async function getModifiers() {
  const saved = await getMetadata('priceModifiers').catch(() => null);
  return mergeModifiers(saved);
}

export async function saveModifiers(values) {
  const merged = mergeModifiers(values);
  await setMetadata('priceModifiers', merged);
  return merged;
}
