import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/card-identify.mjs';
import { buildGeminiRequest, geminiModels, geminiResponseToPayload, isPlausibleGeminiKey } from '../netlify/functions/lib/gemini-provider.mjs';
import { parseCandidates } from '../netlify/functions/lib/vision-provider.mjs';

const FAKE_KEY = 'test-gemini-key-0123456789abcdef';
const IMAGE = 'data:image/jpeg;base64,AAAA';
const post = headers => new Request('https://example.test/.netlify/functions/card-identify', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify({ game: 'Yu-Gi-Oh!', imageDataUrl: IMAGE, ocrText: 'MAGO OSCURO' })
});
const answer = { candidates: [{ content: { parts: [{ text: '{"candidates":[{"name":"Dark Magician","game":"Yu-Gi-Oh!","setCode":"LOB-SP005","language":"ES","evidence":["título impreso"]}]}' }] } }] };

test('la petición a Gemini lleva imagen en inline_data y no envía temperature', () => {
  const req = buildGeminiRequest({ imageDataUrl: IMAGE, game: 'Yu-Gi-Oh!', ocrText: 'x', rules: 'reglas' });
  assert.equal(req.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
  assert.equal(req.contents[0].parts[1].inline_data.data, 'AAAA');
  assert.equal(req.generationConfig.responseMimeType, 'application/json');
  assert.equal('temperature' in req.generationConfig, false);
  assert.throws(() => buildGeminiRequest({ imageDataUrl: 'data:image/svg+xml;base64,AAAA', game: 'x' }));
});

test('modelos configurables con valores por defecto y la respuesta se adapta al parser existente', () => {
  assert.ok(geminiModels('').length >= 2);
  assert.deepEqual(geminiModels('modelo-a, modelo-b'), ['modelo-a', 'modelo-b']);
  assert.deepEqual(geminiModels('mal modelo!;'), geminiModels(''));
  const list = parseCandidates(geminiResponseToPayload(answer), 'Yu-Gi-Oh!');
  assert.equal(list[0].name, 'Dark Magician');
  assert.throws(() => geminiResponseToPayload({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
  assert.equal(isPlausibleGeminiKey(FAKE_KEY), true);
  assert.equal(isPlausibleGeminiKey('corta'), false);
});

test('clave propia: funciona sin TCG_OP_ACCESS_TOKEN y pasa al siguiente modelo si uno no existe', async () => {
  const prior = { t: process.env.TCG_OP_ACCESS_TOKEN, g: process.env.GEMINI_VISION_MODEL };
  delete process.env.TCG_OP_ACCESS_TOKEN;
  process.env.GEMINI_VISION_MODEL = 'modelo-inexistente,modelo-bueno';
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push({ url: String(url), key: init.headers['x-goog-api-key'] });
    if (String(url).includes('modelo-inexistente')) return new Response(`not found ${FAKE_KEY}`, { status: 404 });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const res = await handler(post({ 'x-gemini-key': FAKE_KEY }));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.provider, 'gemini');
    assert.equal(data.model, 'modelo-bueno');
    assert.equal(data.candidates[0].setCode, 'LOB-SP005');
    assert.equal(urls.length, 2);
    assert.ok(urls.every(u => u.key === FAKE_KEY));
    assert.match(urls[1].url, /models\/modelo-bueno:generateContent$/);
  } finally {
    globalThis.fetch = originalFetch;
    prior.t === undefined ? delete process.env.TCG_OP_ACCESS_TOKEN : process.env.TCG_OP_ACCESS_TOKEN = prior.t;
    prior.g === undefined ? delete process.env.GEMINI_VISION_MODEL : process.env.GEMINI_VISION_MODEL = prior.g;
  }
});

test('una clave inválida de Gemini no se redirige a otro proveedor ni se filtra en los errores', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`API key not valid ${FAKE_KEY}`, { status: 403 });
  try {
    const res = await handler(post({ 'x-gemini-key': FAKE_KEY }));
    const data = await res.json();
    assert.equal(res.status, 502);
    assert.doesNotMatch(JSON.stringify(data), new RegExp(FAKE_KEY));
  } finally { globalThis.fetch = originalFetch; }
});

test('sin clave propia ni token privado el endpoint sigue bloqueado', async () => {
  process.env.TCG_OP_ACCESS_TOKEN = 'x'.repeat(40);
  const res = await handler(post({}));
  assert.equal(res.status, 401);
  delete process.env.TCG_OP_ACCESS_TOKEN;
});
