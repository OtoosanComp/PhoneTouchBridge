import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/card-identify.mjs';
import { parseCandidates, sanitizePriceEstimate } from '../netlify/functions/lib/vision-provider.mjs';
import { buildGeminiRequest } from '../netlify/functions/lib/gemini-provider.mjs';
import { validateVisionResult } from '../src/card-intelligence/core.js';
import { computeCandidatePrice, describeValuation } from '../src/card-intelligence/price-ui.js';

const KEY = 'test-gemini-key-0123456789abcdef';
const card = extra => ({ name: 'Dark Magician', game: 'Yu-Gi-Oh!', setCode: 'LOB-EN005', evidence: ['título'], ...extra });
const wrap = candidates => ({ output_text: JSON.stringify({ candidates }) });

test('el prompt de Gemini pide el rango de precio y permite null cuando no sabe', () => {
  const text = buildGeminiRequest({ imageDataUrl: 'data:image/jpeg;base64,AAAA', game: 'Yu-Gi-Oh!' }).contents[0].parts[0].text;
  assert.match(text, /priceEstimate/);
  assert.match(text, /prefer null/);
  assert.doesNotMatch(text, /Do not infer price/);
});

test('solo se acepta una estimación con forma y rango razonables', () => {
  assert.deepEqual(sanitizePriceEstimate({ low: 10, high: 14, currency: 'usd', basis: 'x', confidence: 'medium' }), { low: 10, high: 14, currency: 'USD', basis: 'x', confidence: 'medium' });
  for (const bad of [null, {}, { low: 0, high: 5, currency: 'USD' }, { low: 9, high: 3, currency: 'USD' }, { low: 1, high: 100, currency: 'USD' }, { low: 1, high: 2, currency: 'EUR' }, { low: 'a', high: 2, currency: 'USD' }]) {
    assert.equal(sanitizePriceEstimate(bad), null, JSON.stringify(bad));
  }
});

test('parseCandidates conserva la estimación solo cuando se permite (Gemini) y la descarta si es inválida', () => {
  const good = { low: 10, high: 14, currency: 'USD', basis: 'rango típico', confidence: 'low' };
  assert.deepEqual(parseCandidates(wrap([card({ priceEstimate: good })]), 'Yu-Gi-Oh!', { allowPrice: true })[0].priceEstimate, good);
  assert.equal('priceEstimate' in parseCandidates(wrap([card({ priceEstimate: good })]), 'Yu-Gi-Oh!')[0], false);
  assert.equal('priceEstimate' in parseCandidates(wrap([card({ priceEstimate: { low: 5, high: 1, currency: 'USD' } })]), 'Yu-Gi-Oh!', { allowPrice: true })[0], false);
  assert.equal('priceEstimate' in parseCandidates(wrap([card({ priceEstimate: null })]), 'Yu-Gi-Oh!', { allowPrice: true })[0], false);
});

test('la función devuelve la estimación de Gemini junto con los campos de la carta', async () => {
  const original = globalThis.fetch;
  const body = { candidates: [{ content: { parts: [{ text: JSON.stringify({ candidates: [card({ priceEstimate: { low: 20, high: 30, currency: 'USD', basis: 'LOB UR', confidence: 'low' } })] }) }] } }] };
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
  try {
    const res = await handler(new Request('https://example.test/f', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gemini-key': KEY }, body: JSON.stringify({ game: 'Yu-Gi-Oh!', imageDataUrl: 'data:image/jpeg;base64,AAAA' }) }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.candidates[0].priceEstimate.high, 30);
    assert.doesNotThrow(() => data.candidates.forEach(validateVisionResult));
  } finally { globalThis.fetch = original; }
});

test('el cliente rechaza estimaciones mal formadas', () => {
  assert.throws(() => validateVisionResult(card({ priceEstimate: { low: 3, high: 1, currency: 'USD' } })), /priceEstimate/);
  assert.equal(validateVisionResult(card({ priceEstimate: { low: 1, high: 3, currency: 'MXN' } })), true);
});

test('precio: sin cotización local se usa el promedio del rango de Gemini, marcado como estimación', () => {
  const candidate = { id: 'x', ...card({ priceEstimate: { low: 10, high: 14, currency: 'USD', basis: 'rango típico', confidence: 'low' } }), marketQuotes: [] };
  const v = computeCandidatePrice({ candidate, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: 18 });
  assert.equal(v.status, 'available');
  assert.equal(v.value, 216);
  assert.equal(v.estimateType, 'ai-estimate');
  assert.equal(v.confidence, 'low');
  assert.match(describeValuation(v), /Estimación de IA.*SIN fuente verificable/);
  assert.equal(computeCandidatePrice({ candidate, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: null }).reason, 'fx_missing');
  const mxn = { ...candidate, priceEstimate: { low: 100, high: 140, currency: 'MXN' } };
  assert.equal(computeCandidatePrice({ candidate: mxn, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: null }).value, 120);
});

test('la cotización local siempre tiene prioridad sobre la estimación de la IA', () => {
  const candidate = {
    id: 'p1', printingId: 'p1', rarity: 'Ultra Rare', ...card({ priceEstimate: { low: 1, high: 2, currency: 'USD' } }),
    marketQuotes: [{ printingId: 'p1', finish: 'Ultra Rare', price: 25, currency: 'USD', source: 'YGOPRODeck set price', scope: 'printing-indicative' }]
  };
  const v = computeCandidatePrice({ candidate, game: 'Yu-Gi-Oh!', version: 'Unlimited', fxRate: 18 });
  assert.equal(v.value, 450);
  assert.notEqual(v.estimateType, 'ai-estimate');
});
