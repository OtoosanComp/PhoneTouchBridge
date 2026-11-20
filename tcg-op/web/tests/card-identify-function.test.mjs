import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/card-identify.mjs';

const oldEnv = { ...process.env };
test('card-identify endpoint blocks requests without private app token', async () => {
  process.env.TCG_OP_ACCESS_TOKEN = 'x'.repeat(40);
  const req = new Request('https://example.test/.netlify/functions/card-identify', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({game:'Riftbound',imageDataUrl:'data:image/jpeg;base64,AAAA'}) });
  const res = await handler(req);
  assert.equal(res.status,401);
});

test('card-identify endpoint rejects oversized / unsupported image before provider call', async () => {
  process.env.TCG_OP_ACCESS_TOKEN = 'x'.repeat(40);
  const req = new Request('https://example.test/.netlify/functions/card-identify', { method:'POST', headers:{'content-type':'application/json','x-tcg-op-token':'x'.repeat(40)}, body:JSON.stringify({game:'Riftbound',imageDataUrl:'data:image/svg+xml;base64,AAAA'}) });
  const res = await handler(req);
  assert.equal(res.status,400);
});

test.after(() => { for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env, oldEnv); });

test('card-identify routes an authenticated image to NVIDIA and returns structured candidates', async () => {
  const prior = { TCG_OP_ACCESS_TOKEN:process.env.TCG_OP_ACCESS_TOKEN, NVIDIA_API_KEY:process.env.NVIDIA_API_KEY, AI_PROVIDER_PRIORITY:process.env.AI_PROVIDER_PRIORITY };
  process.env.TCG_OP_ACCESS_TOKEN = 'z'.repeat(40);
  process.env.NVIDIA_API_KEY = 'nv-test-key';
  process.env.AI_PROVIDER_PRIORITY = 'nvidia';
  const originalFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices:[{ message:{ content:'{"candidates":[{"name":"Platewyrm Egg","game":"Riftbound","setCode":"OGN-017","evidence":["printed title"]}]}' } }] }), { status:200, headers:{'content-type':'application/json'} });
  };
  try {
    const req = new Request('https://example.test/.netlify/functions/card-identify', { method:'POST', headers:{'content-type':'application/json','x-tcg-op-token':'z'.repeat(40)}, body:JSON.stringify({game:'Riftbound',imageDataUrl:'data:image/jpeg;base64,AAAA',ocrText:'Platewyrm Egg'}) });
    const res = await handler(req);
    const data = await res.json();
    assert.equal(res.status,200);
    assert.equal(data.provider,'nvidia');
    assert.equal(data.candidates[0].name,'Platewyrm Egg');
    assert.equal(seen.url,'https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct');
    assert.equal(seen.init.headers.Authorization,'Bearer nv-test-key');
    assert.equal(seen.body.messages[0].content[1].image_url.url,'data:image/jpeg;base64,AAAA');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key]=value;
  }
});

test('card-identify uses OpenAI first and returns verified structured candidates', async () => {
  const prior = {
    TCG_OP_ACCESS_TOKEN: process.env.TCG_OP_ACCESS_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AI_PROVIDER_PRIORITY: process.env.AI_PROVIDER_PRIORITY,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    HOME_AI_BASE_URL: process.env.HOME_AI_BASE_URL
  };
  process.env.TCG_OP_ACCESS_TOKEN = 'o'.repeat(40);
  process.env.OPENAI_API_KEY = 'sk-test-openai';
  process.env.AI_PROVIDER_PRIORITY = 'openai';
  delete process.env.NVIDIA_API_KEY;
  delete process.env.HOME_AI_BASE_URL;
  const originalFetch = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [{ name: 'Platewyrm Egg', game: 'Riftbound', setCode: 'VEN', collectorNumber: '075/166', setName: 'Spiritforged', type: 'Unit', language: 'EN', rarity: 'Common', edition: '', visualDescription: 'Printed title and number are legible', evidence: ['title printed on card'] }] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const req = new Request('https://example.test/.netlify/functions/card-identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tcg-op-token': 'o'.repeat(40) },
      body: JSON.stringify({ game: 'Riftbound', imageDataUrl: 'data:image/jpeg;base64,AAAA', ocrText: 'Platewyrm Egg' })
    });
    const res = await handler(req);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.provider, 'openai');
    assert.equal(data.model, 'gpt-5.4-mini');
    assert.equal(data.candidates[0].collectorNumber, '075/166');
    assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seen.init.headers.Authorization, 'Bearer sk-test-openai');
    assert.equal(seen.body.response_format.type, 'json_schema');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('AI status reports OpenAI as configured primary provider', async () => {
  const statusHandler = (await import('../netlify/functions/ai-status.mjs')).default;
  const prior = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL };
  process.env.OPENAI_API_KEY = 'sk-status-test';
  delete process.env.OPENAI_VISION_MODEL;
  try {
    const res = await statusHandler(new Request('https://example.test/.netlify/functions/ai-status'));
    const data = await res.json();
    assert.equal(data.provider, 'openai-cloud');
    assert.equal(data.openaiConfigured, true);
    assert.equal(data.visionModel, 'gpt-5.4-mini');
  } finally {
    for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
