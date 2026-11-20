function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function filterOutliers(values) {
  if (values.length < 4) return values;
  const center = median(values);
  const deviations = values.map(value => Math.abs(value - center));
  const mad = median(deviations);
  if (mad > 0) {
    const robustZ = value => 0.6745 * (value - center) / mad;
    const retained = values.filter(value => Math.abs(robustZ(value)) <= 3.5);
    if (retained.length) return retained;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = median(sorted.slice(0, Math.floor(sorted.length / 2)));
  const q3 = median(sorted.slice(Math.ceil(sorted.length / 2)));
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr === 0) return values;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return values.filter(value => value >= low && value <= high);
}

export function estimateFairMarketValue(quotes = [], {
  printingId, finish, currency = 'MXN', usdMxn = null, allowIndicative = true
} = {}) {
  const comparable = quotes.filter(q => {
    if (!q || q.printingId !== printingId || q.finish !== finish) return false;
    if (q.scope === 'card-level') return false;
    if (q.scope === 'printing-indicative' && !allowIndicative) return false;
    return Number.isFinite(Number(q.price)) && Number(q.price) > 0;
  }).map(q => {
    let price = Number(q.price);
    if (q.currency === currency) return { ...q, convertedPrice: price };
    if (q.currency === 'USD' && currency === 'MXN' && Number.isFinite(Number(usdMxn)) && Number(usdMxn) > 0) {
      return { ...q, convertedPrice: price * Number(usdMxn) };
    }
    return null;
  }).filter(Boolean);

  const prices = comparable.map(q => q.convertedPrice);
  const retained = filterOutliers(prices);
  if (!retained.length) return { status: 'unavailable', value: null, currency, sampleSize: 0, confidence: 'none', sources: [] };
  const value = Math.round(median(retained) * 100) / 100;
  const confidence = retained.length >= 3 ? 'medium' : retained.length === 2 ? 'low' : 'low';
  return {
    status: 'available', value, currency, sampleSize: retained.length,
    confidence, estimateType: retained.length >= 3 ? 'market-estimate' : 'single-source-reference',
    range: { min: Math.min(...retained), max: Math.max(...retained) },
    sources: comparable.filter(q => retained.includes(q.convertedPrice)).map(q => q.source),
    scope: comparable.some(q => q.scope === 'printing-indicative') ? 'indicative-printing' : 'exact-printing',
    observedAt: comparable.map(q => q.observedAt).filter(Boolean).sort().at(-1) || null
  };
}
