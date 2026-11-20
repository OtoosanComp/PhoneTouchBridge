import { validateCatalogRecord } from './core.js';
import { getCatalogRecords, getLearningRecords, getMetadata } from './database.js';
import { applyLearningBoost } from './learning.js';
import { buildCatalogIndex, rankFromIndex } from './catalog-index.js';

const CATALOG_PATHS = {
  'Riftbound': './catalogs/riftbound.json',
  'Yu-Gi-Oh!': './catalogs/yugioh.json'
};
const META_KEYS = { 'Riftbound': 'riftboundCatalog', 'Yu-Gi-Oh!': 'yugiohCatalog' };
const ALIAS_PATH = './catalogs/yugioh-es-aliases.json';
const cache = new Map();

export async function loadCatalog(game, fetcher = fetch) {
  const localRecords = await getCatalogRecords(game).catch(() => []);
  if (localRecords.length) return localRecords;
  const path = CATALOG_PATHS[game];
  if (!path) throw new Error(`Unsupported game catalog: ${game}`);
  const response = await fetcher(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Catalog unavailable: ${game}`);
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('Catalog must be an array');
  records.forEach(validateCatalogRecord);
  if (!records.length) throw new Error(`El catálogo local de ${game} está vacío. Pulsa 'Descargar / actualizar catálogos'.`);
  return records;
}

/** Nombres en español: archivo incluido + los que el propietario importó (metadata 'ygoAliasesEs'). */
async function loadAliases(game, fetcher) {
  if (game !== 'Yu-Gi-Oh!') return { aliases: {}, stamp: '' };
  let bundled = {};
  try {
    const response = await fetcher(ALIAS_PATH, { cache: 'no-cache' });
    if (response.ok) bundled = await response.json();
  } catch { /* sin archivo base: se usa solo lo importado y lo aprendido */ }
  const imported = await getMetadata('ygoAliasesEs').catch(() => null);
  const importedMap = imported && typeof imported === 'object' ? imported : {};
  const merged = { ...bundled };
  for (const [key, value] of Object.entries(importedMap)) merged[key] = [...new Set([].concat(merged[key] || [], value))];
  return { aliases: merged, stamp: `${Object.keys(bundled).length}/${Object.keys(importedMap).length}` };
}

export async function getCatalogIndex(game, fetcher = fetch) {
  const meta = await getMetadata(META_KEYS[game]).catch(() => null);
  const learned = await getLearningRecords(game).catch(() => []);
  const { aliases, stamp: aliasStamp } = await loadAliases(game, fetcher);
  const stamp = `${meta?.syncedAt || 'sin-sync'}|${meta?.count || 0}|${learned.length}|${aliasStamp}`;
  const cached = cache.get(game);
  if (cached?.stamp === stamp) return cached;
  const records = await loadCatalog(game, fetcher);
  const entry = { stamp, index: buildCatalogIndex(records, { aliases, learned }), learned };
  cache.set(game, entry);
  return entry;
}

export function invalidateCatalogIndex(game = null) {
  if (game) cache.delete(game); else cache.clear();
}

export async function findCatalogCandidates(game, ocrText, fetcher = fetch) {
  const { index, learned } = await getCatalogIndex(game, fetcher);
  const ranked = rankFromIndex(index, ocrText, { limit: 60 });
  return applyLearningBoost(ranked, { game, ocrText }, learned)
    .sort((a, b) => (b.rawScore ?? b.score) - (a.rawScore ?? a.score));
}
