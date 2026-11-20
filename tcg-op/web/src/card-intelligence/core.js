import { extractCodeCandidates, extractPasscodes, normalizePasscode, parseSetCode, detectEdition } from './codes.js';
import { bigrams, nameSimilarity } from './text-match.js';

import { VISION_GAMES } from './vision-parse.mjs';

/** Juegos con catálogo local (OCR + catálogo). */
export const SUPPORTED_GAMES = Object.freeze(['Riftbound', 'Yu-Gi-Oh!']);
export const CATALOG_GAMES = SUPPORTED_GAMES;
export { VISION_GAMES };
export const AUTO_IDENTIFY_THRESHOLD = 0.94;
export const MIN_CANDIDATE_MARGIN = 0.12;

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractCardSignals(ocrText = '') {
  const raw = String(ocrText);
  const normalized = normalizeText(raw);
  const lines = raw.split(/\r?\n/).map(line => normalizeText(line)).filter(Boolean);
  // TCG set/collector identifiers are retained as independent evidence.
  const codes = [...new Set((normalized.match(/\b[a-z]{2,6}\s*\d{1,4}(?:\s[a-z]{2,4}\d{1,4})?\b/g) || [])
    .map(code => code.replace(/\s+/g, ' ').trim()))];
  return {
    raw, normalized, lines, codes,
    // Evidencia tolerante a OCR e independiente del idioma de la carta.
    parsedCodes: extractCodeCandidates(raw),
    passcodes: extractPasscodes(raw),
    edition: detectEdition(raw)
  };
}

function tokenSimilarity(a, b) {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / new Set([...left, ...right]).size;
}

const gramCache = new Map();
function cachedGrams(text) {
  let grams = gramCache.get(text);
  if (!grams) {
    if (gramCache.size > 60000) gramCache.clear();
    grams = bigrams(text);
    gramCache.set(text, grams);
  }
  return grams;
}

/** Mejor coincidencia entre las líneas del OCR y uno o varios nombres (inglés, español, aprendidos). */
export function matchName(signals, names = []) {
  const lines = (signals?.lines || []).filter(line => line.length >= 3 && line.length <= 60).slice(0, 30);
  let best = { sim: 0, exact: false, via: 0 };
  names.forEach((rawName, via) => {
    const name = normalizeText(rawName || '');
    if (name.length < 3) return;
    const nameGrams = cachedGrams(name);
    for (const line of lines) {
      const hit = nameSimilarity(line, name, cachedGrams(line), nameGrams);
      if ((hit.exact && !best.exact) || (hit.exact === best.exact && hit.sim > best.sim)) best = { ...hit, via };
    }
  });
  return best;
}

export function candidateCodeKey(candidate) {
  return parseSetCode(candidate?.setCode || candidate?.collectorNumber || '')?.key || null;
}

export function scoreCandidate(signals, candidate, ctx = {}) {
  const evidence = [];
  let score = 0;
  const candidateName = normalizeText(candidate?.name || '');
  const ocr = signals?.normalized || '';

  // 1) Passcode de 8 dígitos: no depende del idioma ni de la edición.
  const passcode = normalizePasscode(candidate?.cardPasscode || candidate?.passcode || '');
  if (passcode && signals?.passcodes?.includes(passcode)) { score += 0.6; evidence.push('passcode_exact'); }

  // 2) Nombre: exacto por línea, difuso (OCR sucio) o por alias (español / aprendido).
  const names = [candidate?.name, ...(candidate?.aliases || []), ...(ctx.aliases || [])];
  const name = ctx.nameMatch || (signals?.lines?.length ? matchName(signals, names) : { sim: 0, exact: false, via: 0 });
  let nameScore = 0;
  if (name.exact) { nameScore = 0.58; evidence.push(name.via > 0 ? 'name_alias_exact' : 'name_exact'); }
  else if (name.sim >= 0.72) { nameScore = 0.5 * name.sim; evidence.push(name.via > 0 ? 'name_alias_fuzzy' : 'name_fuzzy'); }
  else if (!signals?.lines?.length && candidateName && ocr.includes(candidateName)) { nameScore = 0.58; evidence.push('name_exact'); }
  else {
    const similarity = tokenSimilarity(ocr, candidateName);
    nameScore = similarity * 0.38;
    if (similarity >= 0.5) evidence.push('name_token_similarity');
  }
  score += nameScore;

  // 3) Código de impresión: se compara prefijo + número, ignorando la letra de idioma.
  const key = candidateCodeKey(candidate);
  const cm = key && (ctx.codeMatches?.get(key) || signals?.parsedCodes?.find(p => p.key === key));
  const setCode = normalizeText(candidate?.setCode || candidate?.collectorNumber || '');
  if (cm) {
    score += cm.fuzzy ? 0.34 : 0.42;
    evidence.push(cm.fuzzy ? 'set_code_fuzzy' : 'set_code_exact');
  } else if (setCode && signals?.codes?.includes(setCode)) {
    score += 0.42; evidence.push('set_code_exact');
  } else if (setCode && ocr.includes(setCode)) {
    score += 0.35; evidence.push('set_code_partial');
  }
  // rawScore conserva la diferencia entre impresiones aunque el puntaje visible se limite a 1.
  return { ...candidate, score: Math.min(1, Number(score.toFixed(4))), rawScore: Number(score.toFixed(4)), evidence, matchedVia: name.via > 0 ? 'alias' : 'catalog' };
}

export function decideIdentification(candidates = [], { threshold = AUTO_IDENTIFY_THRESHOLD, margin = MIN_CANDIDATE_MARGIN } = {}) {
  const rank = c => Number(c?.rawScore ?? c?.score ?? 0);
  const ranked = [...candidates].sort((a, b) => rank(b) - rank(a));
  if (!ranked.length) return { status: 'not_found', candidate: null, candidates: [] };
  const first = ranked[0];
  const second = ranked[1];
  const gap = rank(first) - rank(second);
  const safe = Number(first.score || 0) >= threshold && (!second || gap >= margin);
  return {
    status: safe ? 'identified' : 'needs_review',
    candidate: first,
    candidates: ranked.slice(0, 8),
    confidence: Number(first.score || 0),
    margin: Number(gap.toFixed(4))
  };
}

export function validateVisionResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vision result must be an object');
  const allowed = new Set(['name', 'game', 'setCode', 'collectorNumber', 'language', 'rarity', 'edition', 'setName', 'set', 'type', 'cardType', 'visualDescription', 'evidence', 'priceEstimate']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Vision result field not allowed: ${key}`);
  if (typeof value.name !== 'string' || !value.name.trim()) throw new Error('Vision result name is required');
  if (!VISION_GAMES.includes(value.game)) throw new Error('Vision result game is not supported');
  for (const key of ['setCode', 'collectorNumber', 'language', 'rarity', 'edition', 'setName', 'set', 'type', 'cardType', 'visualDescription']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`${key} must be text`);
  }
  if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.some(x => typeof x !== 'string'))) {
    throw new Error('evidence must be an array of strings');
  }
  if (value.priceEstimate !== undefined) {
    const e = value.priceEstimate;
    const ok = e && typeof e === 'object' && Number.isFinite(e.low) && Number.isFinite(e.high) && e.low > 0 && e.high >= e.low && ['USD', 'MXN'].includes(e.currency);
    if (!ok) throw new Error('priceEstimate is invalid');
  }
  return true;
}

export function validateCatalogRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Catalog record is required');
  if (typeof record.id !== 'string' || !record.id.trim()) throw new Error('Catalog id is required');
  if (!SUPPORTED_GAMES.includes(record.game)) throw new Error('Catalog game is not supported');
  if (typeof record.name !== 'string' || !record.name.trim()) throw new Error('Catalog name is required');
  return true;
}

/** Map verified catalog/vision attributes into distinct form fields. */
export function mapIdentificationToForm(candidate = {}) {
  return {
    cardName: String(candidate.name || '').trim(),
    cardCode: String(candidate.collectorNumber || candidate.setCode || '').trim(),
    cardPasscode: String(candidate.cardPasscode || candidate.passcode || '').trim(),
    setName: String(candidate.setName || candidate.set || '').trim(),
    rarity: String(candidate.rarity || '').trim(),
    language: String(candidate.language || '').trim(),
    cardType: String(candidate.type || candidate.cardType || '').trim(),
    edition: String(candidate.edition || '').trim()
  };
}

/** Never manufacture a market price: only accept a numeric quote with a named source. */
export function normalizeMarketQuote(quote) {
  const price = Number(quote?.price);
  if (!quote || !Number.isFinite(price) || price < 0 || typeof quote.source !== 'string' || !quote.source.trim()) {
    return { price: null, currency: 'MXN', source: null, status: 'unavailable' };
  }
  return {
    price,
    currency: typeof quote.currency === 'string' && quote.currency.trim() ? quote.currency : 'MXN',
    source: quote.source.trim(),
    status: 'available'
  };
}

/** User-editable printing/finish choices are deliberately separate from rarity. */
export function getVersionOptions(game) {
  if (game === 'Riftbound') return ['Normal', 'Foil', 'Alternate Art'];
  if (game === 'Yu-Gi-Oh!') return ['Unlimited', '1st Edition', 'Limited Edition', 'Collector Tin'];
  if (game === 'Pokémon') return ['Normal', 'Reverse Holo', 'Holo', 'Full Art', 'Alternate Art'];
  if (game === 'Magic: The Gathering') return ['Normal', 'Foil', 'Etched Foil', 'Showcase'];
  return ['Normal', 'Foil', 'Alternate Art'];
}
