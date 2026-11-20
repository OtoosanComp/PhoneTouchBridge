import { mapRiftHuntRecords, mapYugiohRecords } from './catalog-normalizers.js';
import { replaceCatalogRecords, getMetadata, setMetadata } from './database.js';

const RIFTHUNT_CARDS = 'https://api.rifthunt.com/bulk/cards';
const RIFTHUNT_PRICES = 'https://api.rifthunt.com/bulk/prices';
const YGO_CARDS = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const YGO_VERSION = 'https://db.ygoprodeck.com/api/v7/checkDBVer.php';
const YGO_SCHEMA = 2; // 2 = ids únicos por rareza, passcode sin ceros, piso card-level
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN';

async function getJson(url, fetcher) {
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Fuente respondió ${response.status}: ${new URL(url).hostname}`);
  return response.json();
}

function arrayFromPayload(payload, label) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.cards)) return payload.cards;
  if (Array.isArray(payload?.printings)) return payload.printings;
  if (Array.isArray(payload?.prices)) return payload.prices;
  throw new Error(`Formato de catálogo no reconocido (${label})`);
}

export async function syncRiftboundCatalog({ fetcher = fetch, onProgress = () => {}, force = false } = {}) {
  const prior = await getMetadata('riftboundCatalog');
  const age = prior?.syncedAt ? Date.now() - Date.parse(prior.syncedAt) : Infinity;
  if (!force && prior?.count > 0 && age < 20 * 60 * 60 * 1000) return { game: 'Riftbound', count: prior.count, skipped: true };
  onProgress('Tsuki: descargando catálogo Riftbound…');
  const [cardsPayload, pricesPayload] = await Promise.all([
    getJson(RIFTHUNT_CARDS, fetcher), getJson(RIFTHUNT_PRICES, fetcher)
  ]);
  const cards = arrayFromPayload(cardsPayload, 'RiftHunt cards');
  const prices = arrayFromPayload(pricesPayload, 'RiftHunt prices');
  const records = mapRiftHuntRecords(cards, prices);
  if (records.length < 100) throw new Error('El catálogo Riftbound llegó incompleto; se conserva la versión local.');
  await replaceCatalogRecords('Riftbound', records);
  await setMetadata('riftboundCatalog', { count: records.length, source: 'RiftHunt', syncedAt: new Date().toISOString() });
  return { game: 'Riftbound', count: records.length, priceRows: prices.length };
}

export async function syncYugiohCatalog({ fetcher = fetch, onProgress = () => {}, force = false } = {}) {
  onProgress('Tsuki: comprobando versión del catálogo Yu-Gi-Oh!…');
  const version = await getJson(YGO_VERSION, fetcher);
  const versionId = String(version.database_version ?? version.date ?? 'unknown');
  const prior = await getMetadata('yugiohCatalog');
  if (!force && prior?.version === versionId && prior?.count > 0 && prior?.schema === YGO_SCHEMA) {
    return { game: 'Yu-Gi-Oh!', count: prior.count, skipped: true, version: versionId };
  }
  onProgress('Tsuki: descargando catálogo completo Yu-Gi-Oh!…');
  const payload = await getJson(YGO_CARDS, fetcher);
  const cards = arrayFromPayload(payload, 'YGOPRODeck');
  const records = mapYugiohRecords(cards);
  if (records.length < 1000) throw new Error('El catálogo Yu-Gi-Oh! llegó incompleto; se conserva la versión local.');
  await replaceCatalogRecords('Yu-Gi-Oh!', records);
  await setMetadata('yugiohCatalog', { count: records.length, source: 'YGOPRODeck', version: versionId, schema: YGO_SCHEMA, syncedAt: new Date().toISOString() });
  return { game: 'Yu-Gi-Oh!', count: records.length, version: versionId };
}

export async function refreshUsdMxn({ fetcher = fetch } = {}) {
  const payload = await getJson(FX_URL, fetcher);
  const rate = Number(payload?.rates?.MXN);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('No se recibió un tipo de cambio USD/MXN válido.');
  const value = { rate, date: payload.date || null, source: 'Frankfurter / ECB', fetchedAt: new Date().toISOString() };
  await setMetadata('usdMxn', value);
  return value;
}

export async function syncAllCatalogs({ fetcher = fetch, onProgress = () => {}, forceYugioh = false } = {}) {
  const results = [];
  results.push(await syncRiftboundCatalog({ fetcher, onProgress }));
  results.push(await syncYugiohCatalog({ fetcher, onProgress, force: forceYugioh }));
  let fx = null;
  try { fx = await refreshUsdMxn({ fetcher }); }
  catch (error) { onProgress(`Yami: tipo de cambio no actualizado; se conserva el último disponible. ${error.message}`); }
  return { results, fx };
}
