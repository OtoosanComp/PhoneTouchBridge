import { normalizeText } from './core.js';

export function buildCatalogKey(record) {
  return `${record.game}|${record.id}|${record.setCode || ''}`.toLowerCase();
}

function numberOrNull(value) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}

function readFinishPrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return numberOrNull(value);
  for (const key of ['market', 'marketPrice', 'market_price', 'mid', 'midPrice', 'mid_price', 'price']) {
    const n = numberOrNull(value[key]);
    if (n !== null) return n;
  }
  return null;
}

export function mapRiftHuntRecords(cards = [], prices = []) {
  const pricesByPrinting = new Map();
  for (const row of prices) {
    const key = String(row.printing_id || row.printingId || '');
    if (key) pricesByPrinting.set(key, row);
  }
  return cards.filter(card => card && (card.printing_id || card.printingId || card.id) && card.name)
    .map(card => {
      const printingId = String(card.printing_id || card.printingId || card.id);
      const priceRow = pricesByPrinting.get(printingId);
      const finishList = Array.isArray(card.finishes) ? card.finishes : [];
      const priceFinishes = priceRow?.finishes || card.prices || {};
      const marketQuotes = finishList.flatMap(finish => {
        const raw = priceFinishes?.[finish];
        const price = readFinishPrice(raw);
        return price === null ? [] : [{
          printingId, finish, price, currency: 'USD', source: 'RiftHunt / TCGplayer',
          scope: 'printing', observedAt: priceRow?.updatedAt || priceRow?.updated_at || null,
          purchaseUri: priceRow?.purchaseUri || card.purchase_uris?.tcgplayer || null
        }];
      });
      const set = String(card.set || '').toUpperCase();
      const collectorNumber = String(card.collector_number || card.collectorNumber || '');
      return {
        id: printingId, printingId, oracleId: card.oracle_id || card.oracleId || null,
        game: 'Riftbound', name: String(card.name), setCode: [set, collectorNumber].filter(Boolean).join('-'),
        collectorNumber, setName: card.set_name || card.setName || '', rarity: card.rarity || '',
        type: card.type || '', language: card.lang || card.language || 'en',
        variant: card.variant || '', finishes: finishList, marketQuotes,
        imageUrl: card.images?.normal || card.images?.large || null,
        source: 'RiftHunt', sourceUrl: card.rifthunt_uri || null,
        searchName: normalizeText(card.name)
      };
    });
}

function positivePrice(value) {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Piso del mercado a nivel de CARTA (impresión más barata). Solo informativo: nunca se usa como precio de una impresión. */
function cardFloorUsd(card) {
  const row = Array.isArray(card.card_prices) ? card.card_prices[0] : null;
  if (!row) return null;
  const values = ['tcgplayer_price', 'ebay_price', 'amazon_price', 'coolstuffinc_price'].map(k => positivePrice(row[k])).filter(v => v !== null);
  return values.length ? Math.round(median(values) * 100) / 100 : null;
}

const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);

export function mapYugiohRecords(cards = []) {
  return cards.filter(card => card && card.id && card.name).flatMap(card => {
    const sets = Array.isArray(card.card_sets) && card.card_sets.length ? card.card_sets : [null];
    const floor = cardFloorUsd(card);
    const seen = new Set();
    return sets.map((set, index) => {
      const setCode = set?.set_code || '';
      const rarity = set?.set_rarity || '';
      // Mismo código con distintas rarezas (p. ej. Ultra y Secret) = impresiones distintas.
      let printingId = `ygopro-${card.id}-${setCode || 'base'}-${slug(set?.set_rarity_code || rarity) || 'x'}`;
      if (seen.has(printingId)) printingId = `${printingId}-${index}`;
      seen.add(printingId);
      const setPrice = positivePrice(set?.set_price);
      const marketQuotes = setPrice === null ? [] : [{
        printingId, finish: rarity || 'unspecified', price: setPrice, currency: 'USD',
        source: 'YGOPRODeck set price', scope: 'printing-indicative', observedAt: null
      }];
      return {
        id: printingId, printingId,
        game: 'Yu-Gi-Oh!', name: String(card.name), setCode, collectorNumber: setCode,
        setName: set?.set_name || '', rarity, type: card.type || '',
        language: 'EN', finishes: [], marketQuotes,
        cardFloorUsd: floor,
        imageUrl: card.card_images?.[0]?.image_url_small || null,
        source: 'YGOPRODeck', sourceUrl: card.ygoprodeck_url || null,
        cardPasscode: String(card.id), searchName: normalizeText(card.name),
        marketScope: 'printing-indicative'
      };
    });
  });
}
