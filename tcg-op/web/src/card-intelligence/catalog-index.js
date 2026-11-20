/**
 * Índice de catálogo en memoria (puro: sin DOM ni IndexedDB, por eso es fácil de probar).
 * Orden de evidencia al buscar una carta:
 *   1) passcode de 8 dígitos  2) código de impresión (sin importar idioma)  3) nombre difuso / alias.
 * El nombre solo confirma; el código y el passcode identifican la impresión exacta.
 */
import { normalizeText, scoreCandidate, extractCardSignals, candidateCodeKey } from './core.js';
import { parseSetCode, normalizePasscode, resolvePrefixes, formatPrintedCode } from './codes.js';
import { bigrams, nameSimilarity } from './text-match.js';

const MAX_POOL = 2500;

export function groupKeyOf(record) {
  return normalizePasscode(record?.cardPasscode) || String(record?.oracleId || '') || normalizeText(record?.name || '');
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}

export function buildCatalogIndex(records = [], { aliases = {}, learned = [] } = {}) {
  const byPasscode = new Map(), byKey = new Map(), groups = new Map(), prefixSet = new Set();
  const names = new Map();      // nombre normalizado → { groups:Set, lang }
  const aliasByGroup = new Map(); // grupo → nombres alternativos (para puntuar)

  const addName = (display, group, lang, isAlias) => {
    const norm = normalizeText(display || '');
    if (norm.length < 3) return;
    let entry = names.get(norm);
    if (!entry) { entry = { groups: new Set(), lang, isAlias }; names.set(norm, entry); }
    entry.groups.add(group);
    if (isAlias) {
      entry.isAlias = true; entry.lang = lang;
      const list = aliasByGroup.get(group) || [];
      if (!list.includes(display)) list.push(display);
      aliasByGroup.set(group, list);
    }
  };

  for (const record of records) {
    const group = groupKeyOf(record);
    push(groups, group, record);
    const pass = normalizePasscode(record.cardPasscode);
    if (pass) push(byPasscode, pass, record);
    const parsed = parseSetCode(record.setCode || record.collectorNumber);
    if (parsed) { prefixSet.add(parsed.prefix); push(byKey, parsed.key, record); }
    addName(record.name, group, 'EN', false);
  }
  for (const [key, value] of Object.entries(aliases || {})) {
    const group = normalizePasscode(key);
    if (!groups.has(group)) continue;
    for (const alias of [].concat(value)) addName(String(alias), group, 'ES', true);
  }
  for (const memory of learned) {
    if (!memory?.confirmed || !memory.groupKey || !groups.has(memory.groupKey) || !memory.ocrTitle) continue;
    addName(memory.ocrTitle, memory.groupKey, String(memory.language || 'ES').toUpperCase(), true);
  }
  const nameList = [...names.entries()].map(([norm, info]) => ({ norm, grams: bigrams(norm), ...info }));
  return { byPasscode, byKey, groups, prefixSet, nameList, aliasByGroup, size: records.length };
}

function resolveCodeMatches(index, signals) {
  const matches = new Map();
  for (const parsed of signals.parsedCodes || []) {
    for (const { prefix, fuzzy } of resolvePrefixes(parsed.prefix, index.prefixSet)) {
      const key = `${prefix}|${parsed.number}`;
      if (!index.byKey.has(key)) continue;
      const info = {
        fuzzy, region: parsed.region, lang: parsed.lang,
        printed: formatPrintedCode({ prefix, region: parsed.region, digits: parsed.numberText })
      };
      const prior = matches.get(key);
      const better = !prior || (prior.fuzzy && !info.fuzzy) || (prior.fuzzy === info.fuzzy && !prior.lang && info.lang);
      if (better) matches.set(key, info);
    }
  }
  return matches;
}

function scanNames(index, signals) {
  const lines = (signals.lines || []).filter(line => line.length >= 3 && line.length <= 60).slice(0, 30)
    .map(line => ({ line, grams: bigrams(line) }));
  const best = new Map();
  for (const entry of index.nameList) {
    let hit = { sim: 0, exact: false };
    for (const { line, grams } of lines) {
      if (line.length < entry.norm.length * 0.5 || line.length > entry.norm.length * 1.8 + 4) continue;
      const r = nameSimilarity(line, entry.norm, grams, entry.grams);
      if ((r.exact && !hit.exact) || (r.exact === hit.exact && r.sim > hit.sim)) hit = r;
    }
    if (hit.sim < 0.5) continue;
    for (const group of entry.groups) {
      const prior = best.get(group);
      if (!prior || (hit.exact && !prior.exact) || (hit.exact === prior.exact && hit.sim > prior.sim)) {
        best.set(group, { ...hit, via: entry.isAlias ? 1 : 0, lang: entry.isAlias ? entry.lang : 'EN' });
      }
    }
  }
  return best;
}

function withLanguage(scored, record, codeMatches, nameInfo) {
  const key = candidateCodeKey(record);
  const cm = key ? codeMatches.get(key) : null;
  const baseLang = String(record.language || 'EN').toUpperCase();
  if (cm?.lang && cm.lang !== baseLang) {
    return {
      ...scored, id: `${record.id}|${cm.lang}`, language: cm.lang, languageSource: 'ocr_region',
      baseSetCode: record.setCode, setCode: cm.printed, collectorNumber: cm.printed,
      evidence: [...scored.evidence, 'region_variant']
    };
  }
  if (cm?.lang) return { ...scored, language: cm.lang, languageSource: 'ocr_region' };
  if (nameInfo?.via > 0 && nameInfo.lang) return { ...scored, language: nameInfo.lang, languageSource: 'name_alias' };
  return scored;
}

export function rankFromIndex(index, ocrText, { limit = 60 } = {}) {
  const signals = extractCardSignals(ocrText);
  const codeMatches = resolveCodeMatches(index, signals);
  const nameByGroup = scanNames(index, signals);
  const pool = new Map();
  const addAll = list => { for (const r of list || []) { if (pool.size >= MAX_POOL) return; pool.set(r.id, r); } };

  for (const pass of signals.passcodes) addAll(index.byPasscode.get(pass));
  for (const key of codeMatches.keys()) addAll(index.byKey.get(key));
  for (const [group, hit] of nameByGroup) if (hit.exact || hit.sim >= 0.8) addAll(index.groups.get(group));
  if (!pool.size) {
    [...nameByGroup.entries()].filter(([, hit]) => hit.sim >= 0.6).sort((a, b) => b[1].sim - a[1].sim).slice(0, 6)
      .forEach(([group]) => addAll(index.groups.get(group)));
  }
  const scored = [];
  for (const record of pool.values()) {
    const group = groupKeyOf(record);
    const nameInfo = nameByGroup.get(group) || { sim: 0, exact: false, via: 0 };
    const result = scoreCandidate(signals, record, { nameMatch: nameInfo, codeMatches, aliases: index.aliasByGroup.get(group) });
    scored.push(withLanguage(result, record, codeMatches, nameInfo));
  }
  const edition = signals.edition || null;
  return scored
    .sort((a, b) => (b.rawScore ?? b.score) - (a.rawScore ?? a.score)
      || String(a.setName || '').localeCompare(String(b.setName || ''))
      || String(a.rarity || '').localeCompare(String(b.rarity || '')))
    .slice(0, limit)
    .map(candidate => ({ ...candidate, detectedEdition: edition }));
}
