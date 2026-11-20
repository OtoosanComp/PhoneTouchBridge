// Validación de respuestas de modelos de visión. Compartido por la app y las funciones de Netlify.

/** Juegos que la IA puede identificar. Solo Riftbound y Yu-Gi-Oh! tienen catálogo local. */
export const VISION_GAMES = Object.freeze(['Riftbound', 'Yu-Gi-Oh!', 'Pokémon', 'Magic: The Gathering', 'Otro']);
export function extractModelText(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? payload?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('\n');
  throw new Error('El proveedor no devolvió texto de identificación.');
}

/** Estimación de precio de la IA: solo se acepta con forma válida y rango razonable; si no, se descarta. */
export function sanitizePriceEstimate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const low = Number(value.low), high = Number(value.high);
  const currency = String(value.currency || '').toUpperCase();
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low || high > 1_000_000) return null;
  if (high / low > 20 || !['USD', 'MXN'].includes(currency)) return null;
  return {
    low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100, currency,
    basis: typeof value.basis === 'string' ? value.basis.trim().slice(0, 160) : '',
    confidence: value.confidence === 'medium' ? 'medium' : 'low'
  };
}

export function parseCandidates(payload, game, { allowPrice = false } = {}) {
  const raw = extractModelText(payload).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('La IA devolvió una respuesta que no es JSON válido.'); }
  if (!Array.isArray(parsed.candidates)) throw new Error('La IA no devolvió una lista de candidatos.');
  const fields = ['setCode','collectorNumber','setName','type','language','rarity','edition','visualDescription'];
  return parsed.candidates.slice(0, 5).filter(item =>
    item && typeof item.name === 'string' && item.name.trim() && item.game === game &&
    fields.every(key => item[key] === undefined || typeof item[key] === 'string') &&
    (item.evidence === undefined || (Array.isArray(item.evidence) && item.evidence.every(x => typeof x === 'string')))
  ).map(item => {
    const { priceEstimate, ...rest } = item;
    const estimate = allowPrice ? sanitizePriceEstimate(priceEstimate) : null;
    return { ...rest, name: item.name.trim(), evidence: Array.isArray(item.evidence) ? item.evidence.slice(0, 8) : [], ...(estimate ? { priceEstimate: estimate } : {}) };
  });
}
