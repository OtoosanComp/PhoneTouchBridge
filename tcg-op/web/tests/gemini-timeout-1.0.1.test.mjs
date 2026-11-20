import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/card-identify.mjs';
import { DEFAULT_GEMINI_MODELS, geminiTimeBudgetMs } from '../netlify/functions/lib/gemini-provider.mjs';
import { requestCloudCandidates } from '../src/card-intelligence/cloud.js';

const KEY = 'test-gemini-key-0123456789abcdef';
const request = () => new Request('https://example.test/.netlify/functions/card-identify', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-gemini-key': KEY },
  body: JSON.stringify({ game: 'Yu-Gi-Oh!', imageDataUrl: 'data:image/jpeg;base64,AAAA', ocrText: 'MAGO OSCURO' })
});
const goodAnswer = { candidates: [{ content: { parts: [{ text: '{"candidates":[{"name":"Dark Magician","game":"Yu-Gi-Oh!","setCode":"LOB-EN005","evidence":["título"]}]}' }] } }] };

test('el modelo rápido va primero y el presupuesto de tiempo es acotado', () => {
  assert.match(DEFAULT_GEMINI_MODELS[0], /flash-lite/);
  assert.equal(geminiTimeBudgetMs(undefined), 8500);
  assert.equal(geminiTimeBudgetMs('999999'), 24000);
  assert.equal(geminiTimeBudgetMs('10'), 1000);
});

test('si Gemini no responde a tiempo, la función contesta un 504 claro antes de que Netlify la corte', async () => {
  const original = globalThis.fetch;
  process.env.GEMINI_TIME_BUDGET_MS = '1600';
  // Simula un Gemini que no contesta. El intervalo mantiene vivo el proceso (como lo haría un socket real); AbortSignal.timeout no lo hace.
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
    const keepAlive = setInterval(() => {}, 50);
    init.signal.addEventListener('abort', () => { clearInterval(keepAlive); reject(init.signal.reason); });
  });
  const started = Date.now();
  try {
    const res = await handler(request());
    const data = await res.json();
    assert.equal(res.status, 504);
    assert.equal(data.retryable, true);
    assert.match(data.error, /tardó demasiado/);
    assert.ok(Date.now() - started < 4000, 'debe responder dentro del presupuesto');
  } finally { globalThis.fetch = original; delete process.env.GEMINI_TIME_BUDGET_MS; }
});

test('si el primer modelo está saturado, usa el siguiente sin esperar de más', async () => {
  const original = globalThis.fetch;
  const used = [];
  globalThis.fetch = async url => {
    used.push(String(url).match(/models\/([^:]+):/)[1]);
    return used.length === 1 ? new Response('overloaded', { status: 503 }) : new Response(JSON.stringify(goodAnswer), { status: 200 });
  };
  try {
    const res = await handler(request());
    assert.equal(res.status, 200);
    assert.equal(used.length, 2);
    assert.equal((await res.json()).provider, 'gemini');
  } finally { globalThis.fetch = original; }
});

test('el teléfono reintenta una vez ante 504 y muestra mensajes claros', async () => {
  globalThis.localStorage = { getItem: key => key === 'tcg-op-gemini-key' ? KEY : '' };
  const candidate = { name: 'Dark Magician', game: 'Yu-Gi-Oh!', setCode: 'LOB-EN005', evidence: ['título'] };
  let calls = 0;
  const flaky = async () => (++calls === 1
    ? new Response(JSON.stringify({ error: 'x' }), { status: 504 })
    : new Response(JSON.stringify({ candidates: [candidate], provider: 'gemini', model: 'm' }), { status: 200 }));
  const ok = await requestCloudCandidates({ imageDataUrl: 'data:image/jpeg;base64,AAAA', game: 'Yu-Gi-Oh!', ocrText: '' }, flaky, { retryDelayMs: 0 });
  assert.equal(calls, 2);
  assert.equal(ok.provider, 'gemini');

  const always504 = async () => new Response('<html>Gateway Timeout</html>', { status: 504 });
  await assert.rejects(() => requestCloudCandidates({ imageDataUrl: 'x', game: 'Yu-Gi-Oh!', ocrText: '' }, always504, { retryDelayMs: 0 }), /tardó demasiado/);
  const offline = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => requestCloudCandidates({ imageDataUrl: 'x', game: 'Yu-Gi-Oh!', ocrText: '' }, offline, { retryDelayMs: 0 }), /No se pudo conectar/);
  delete globalThis.localStorage;
});
