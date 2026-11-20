import { estimateFairMarketValue } from './fair-market.js';
import { getMetadata } from './database.js';
import { getModifiers, mergeModifiers } from './price-modifiers.js';

const round2 = value => Math.round(value * 100) / 100;

/** Cálculo puro (sin IndexedDB) para poder probarlo. */
export function computeCandidatePrice({ candidate, game, version, language, fxRate = null, mods = mergeModifiers(null) }) {
  const quotes = Array.isArray(candidate?.marketQuotes) ? candidate.marketQuotes : [];
  const printingId = candidate?.printingId || candidate?.id;
  const lang = String(language || candidate?.language || 'EN').toUpperCase();
  const floorMxn = Number.isFinite(Number(candidate?.cardFloorUsd)) && fxRate ? round2(Number(candidate.cardFloorUsd) * fxRate) : null;
  const hasUsd = quotes.some(q => q?.currency === 'USD');
  const unavailable = reason => ({ status: 'unavailable', value: null, baseValue: null, reason, floorMxn, sampleSize: 0, confidence: 'none', sources: [], multipliers: { finish: 1, language: 1 } });
  const finishMod = { finish: 1, language: 1 };

  let estimate, baseValue;
  if (game === 'Riftbound') {
    const wantFoil = /foil/i.test(String(version));
    estimate = estimateFairMarketValue(quotes, { printingId, finish: wantFoil ? 'foil' : 'normal', currency: 'MXN', usdMxn: fxRate });
    baseValue = estimate.value;
    if (estimate.status !== 'available' && wantFoil) {
      const normal = estimateFairMarketValue(quotes, { printingId, finish: 'normal', currency: 'MXN', usdMxn: fxRate });
      if (normal.status === 'available') {
        finishMod.finish = mods.Riftbound.Foil;
        baseValue = normal.value;
        estimate = { ...normal, value: round2(normal.value * finishMod.finish), confidence: 'low', estimateType: 'finish-adjusted' };
      }
    }
    if (estimate.status === 'available' && String(version) === 'Alternate Art') {
      finishMod.finish *= mods.Riftbound['Alternate Art'];
      estimate = { ...estimate, value: round2(estimate.value * mods.Riftbound['Alternate Art']) };
    }
  } else {
    estimate = estimateFairMarketValue(quotes, { printingId, finish: candidate?.rarity || 'unspecified', currency: 'MXN', usdMxn: fxRate });
    baseValue = estimate.value;
    if (estimate.status === 'available') {
      finishMod.finish = mods['Yu-Gi-Oh!'][version] ?? 1;
      finishMod.language = mods.language[lang] ?? 1;
      estimate = { ...estimate, value: round2(estimate.value * finishMod.finish * finishMod.language) };
    }
  }
  if (estimate.status !== 'available') {
    // Respaldo: estimación de la IA (Gemini). Solo si no hay cotización local; nunca sustituye datos de catálogo.
    const ai = candidate?.priceEstimate;
    const valid = ai && Number.isFinite(ai.low) && Number.isFinite(ai.high) && ai.low > 0 && ai.high >= ai.low && ['USD', 'MXN'].includes(ai.currency);
    if (valid) {
      const middle = (ai.low + ai.high) / 2;
      const mxn = ai.currency === 'MXN' ? middle : (fxRate ? middle * fxRate : null);
      if (mxn) {
        return {
          status: 'available', value: round2(mxn), baseValue: round2(middle), estimateType: 'ai-estimate', confidence: ai.confidence === 'medium' ? 'medium' : 'low',
          sampleSize: 0, sources: ['Gemini (estimación de IA, sin fuente verificable)'], scope: 'ai-estimate',
          aiRange: { low: ai.low, high: ai.high, currency: ai.currency }, aiBasis: ai.basis || '', floorMxn, language: lang, multipliers: { finish: 1, language: 1 }
        };
      }
      return unavailable('fx_missing');
    }
    return unavailable(hasUsd && !fxRate ? 'fx_missing' : 'no_quote');
  }
  return { ...estimate, baseValue, multipliers: finishMod, floorMxn, language: lang };
}

export async function applyCandidatePrice(candidate, game, versionValue, { language } = {}) {
  const fx = await getMetadata('usdMxn').catch(() => null);
  const mods = await getModifiers();
  const result = computeCandidatePrice({ candidate, game, version: versionValue, language, fxRate: fx?.rate || null, mods });
  return { ...result, fxDate: fx?.date || null };
}

/** Texto para el usuario: de dónde sale el número y qué ajustes manuales se aplicaron. */
export function describeValuation(v) {
  if (v.status !== 'available') {
    const floor = v.floorMxn ? ` Referencia mínima de la carta (impresión más barata): $${v.floorMxn.toFixed(2)} MXN; no es el precio de esta impresión.` : '';
    if (v.reason === 'fx_missing') return 'Yami: falta el tipo de cambio USD/MXN. Pulsa "Descargar / actualizar catálogos" con internet.' + floor;
    return 'Yami: no hay cotización comparable para esta impresión. Puedes escribir tu precio manual.' + floor;
  }
  if (v.estimateType === 'ai-estimate') {
    return `Yami · Estimación de IA (Gemini): rango ${v.aiRange.low}–${v.aiRange.high} ${v.aiRange.currency}, promedio $${Number(v.value).toFixed(2)} MXN · SIN fuente verificable y puede estar desactualizada; verifícala o escribe tu precio.${v.aiBasis ? ` Base: ${v.aiBasis}` : ''}`;
  }
  const parts = [];
  if (v.baseValue != null && (v.multipliers.finish !== 1 || v.multipliers.language !== 1)) {
    parts.push(`Base $${Number(v.baseValue).toFixed(2)}`);
    if (v.multipliers.finish !== 1) parts.push(`× acabado ${v.multipliers.finish}`);
    if (v.multipliers.language !== 1) parts.push(`× idioma ${v.multipliers.language}`);
    parts.push('(ajustes manuales editables)');
  }
  const kind = v.estimateType === 'finish-adjusted' ? 'Estimado por factor de acabado'
    : v.sampleSize >= 3 ? 'Valor central (mediana de mercado)' : 'Referencia indicativa';
  return `Yami · ${kind} · ${v.sampleSize} fuente(s) · Confianza ${v.confidence}. ${(v.sources || []).join(', ')}${v.fxDate ? ` · Tipo de cambio ${v.fxDate}` : ''}${parts.length ? ` · ${parts.join(' ')}` : ''}`;
}
