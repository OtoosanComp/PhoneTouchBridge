import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCloudCandidates, requestGeminiDirect, directModelOrder, discoverGeminiModels } from '../src/card-intelligence/cloud.js';
import { buildGeminiRequest, makeGeminiPrompt } from '../src/card-intelligence/gemini-shared.mjs';
import { VISION_GAMES, validateVisionResult } from '../src/card-intelligence/core.js';

const KEY = 'test-gemini-key-0123456789abcdef';
const IMG = 'data:image/jpeg;base64,AAAA';
const answer = (candidate) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ candidates: [candidate] }) }] } }] });
const ok = body => new Response(JSON.stringify(body), { status: 200 });
const withStorage = async (values, fn) => {
  const store = { ...values };
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  try { return await fn(store); } finally { delete globalThis.localStorage; }
};

test('con clave Gemini el teléfono llama directo a Google, sin pasar por Netlify', async () => {
  const urls = [];
  const fetcher = async (url, init) => { urls.push(String(url)); assert.equal(init.headers['x-goog-api-key'], KEY); return ok(answer({ name: 'Dark Magician', game: 'Yu-Gi-Oh!', setCode: 'LOB-EN005', evidence: ['título'] })); };
  const result = await withStorage({ 'tcg-op-gemini-key': KEY }, () => requestCloudCandidates({ imageDataUrl: IMG, game: 'Yu-Gi-Oh!', ocrText: '' }, fetcher));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:generateContent$/);
  assert.equal(result.candidates[0].name, 'Dark Magician');
  assert.match(result.provider, /gemini/);
});

test('si un modelo no existe (404) se descubren los disponibles con la clave del usuario', async () => {
  const used = [];
  const fetcher = async url => {
    url = String(url);
    if (url.includes('?pageSize')) return ok({ models: [
      { name: 'models/gemini-9.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9.0-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] }
    ] });
    const model = url.match(/models\/([^:]+):/)[1];
    used.push(model);
    return model === 'gemini-9.0-flash' ? ok(answer({ name: 'Pikachu', game: 'Pokémon', setCode: '025/165', evidence: [] })) : new Response('not found', { status: 404 });
  };
  const result = await withStorage({}, () => requestGeminiDirect({ imageDataUrl: IMG, game: 'Pokémon', ocrText: '', key: KEY }, fetcher, { retryDelayMs: 0 }));
  assert.equal(result.model, 'gemini-9.0-flash');
  assert.ok(!used.includes('gemini-9.0-flash-image'));
});

test('una clave rechazada se informa de inmediato y nunca aparece en el mensaje', async () => {
  const fetcher = async () => new Response(`{"error":{"message":"API key not valid. ${KEY}"}}`, { status: 400 });
  await assert.rejects(() => requestGeminiDirect({ imageDataUrl: IMG, game: 'Riftbound', key: KEY }, fetcher, { retryDelayMs: 0 }), err => /rechazó la clave/.test(err.message) && !err.message.includes(KEY));
});

test('sin internet el error es claro', async () => {
  const fetcher = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => requestGeminiDirect({ imageDataUrl: IMG, game: 'Riftbound', key: KEY }, fetcher, { retryDelayMs: 0 }), /Revisa tu internet/);
});

test('dentro de la APK sin clave Gemini se pide la clave en vez de llamar a Netlify', async () => {
  globalThis.TCGAndroid = {};
  try {
    await withStorage({ 'tcg-op-access-token': 'x'.repeat(30) }, () =>
      assert.rejects(() => requestCloudCandidates({ imageDataUrl: IMG, game: 'Riftbound' }, async () => { throw new Error('no debe llamar'); }), /clave de Gemini/));
  } finally { delete globalThis.TCGAndroid; }
});

test('la lista de modelos usa alias estables primero y no repite nombres', () => {
  const order = directModelOrder(['gemini-flash-latest', 'gemini-x-flash']);
  assert.equal(order[0], 'gemini-flash-latest');
  assert.equal(new Set(order).size, order.length);
});

test('los modelos descubiertos se guardan en caché', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return ok({ models: [{ name: 'models/gemini-5-flash', supportedGenerationMethods: ['generateContent'] }] }); };
  await withStorage({}, async () => {
    assert.deepEqual(await discoverGeminiModels(KEY, fetcher), ['gemini-5-flash']);
    assert.deepEqual(await discoverGeminiModels(KEY, fetcher), ['gemini-5-flash']);
  });
  assert.equal(calls, 1);
});

test('la IA acepta Pokémon, Magic y otros juegos; el prompt de «Otro» pide el nombre real del juego', () => {
  for (const game of ['Pokémon', 'Magic: The Gathering', 'Otro']) {
    assert.ok(VISION_GAMES.includes(game));
    assert.equal(validateVisionResult({ name: 'X', game }), true);
  }
  assert.match(makeGeminiPrompt({ game: 'Otro' }), /real game name/);
  assert.ok(buildGeminiRequest({ imageDataUrl: IMG, game: 'Pokémon' }).generationConfig.maxOutputTokens >= 1200);
});
