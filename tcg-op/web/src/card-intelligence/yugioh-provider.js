import { scoreCandidate, extractCardSignals } from './core.js';

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const CACHE_KEY = 'tcg_op_ygo_api_cache_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch { /* Browser storage may be disabled or full; API lookup can still work. */ }
}
function firstUsefulLine(ocrText) {
  return String(ocrText).split(/\r?\n/)
    .map(x => x.trim())
    .find(x => /[a-z]{3}/i.test(x) && x.length >= 4 && x.length <= 70 && !/^\d/.test(x)) || '';
}

export async function searchYugiohCatalog(ocrText, fetcher = fetch) {
  const query = firstUsefulLine(ocrText);
  if (!query) return [];
  const cache = readCache();
  const cacheKey = query.toLowerCase();
  const cached = cache[cacheKey];
  let cards;
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
    cards = cached.cards;
  } else {
    const url = `${API}?fname=${encodeURIComponent(query)}&misc=yes`;
    const response = await fetcher(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`YGOPRODeck lookup failed (${response.status})`);
    const payload = await response.json();
    cards = Array.isArray(payload.data) ? payload.data : [];
    cache[cacheKey] = { savedAt: Date.now(), cards };
    const entries = Object.entries(cache).sort((a,b) => b[1].savedAt - a[1].savedAt).slice(0, 40);
    writeCache(Object.fromEntries(entries));
  }
  const signals = extractCardSignals(ocrText);
  const candidates = [];
  for (const card of cards) {
    const printings = Array.isArray(card.card_sets) && card.card_sets.length ? card.card_sets : [null];
    for (const printing of printings) {
      const candidate = {
        id: `ygopro-${card.id}-${printing?.set_code || 'base'}`,
        game: 'Yu-Gi-Oh!', name: card.name,
        setCode: printing?.set_code || '',
        rarity: printing?.set_rarity || '',
        type: card.type || '',
        source: 'YGOPRODeck'
      };
      candidates.push(scoreCandidate(signals, candidate));
    }
  }
  return candidates.sort((a,b) => b.score - a.score).slice(0, 10);
}
