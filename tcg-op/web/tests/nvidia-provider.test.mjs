import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNvidiaRequest, buildHomeRequest, parseCandidates, normalizeBaseUrl, DEFAULT_NVIDIA_URL } from '../netlify/functions/lib/vision-provider.mjs';

test('NVIDIA vision request uses documented model endpoint and multimodal image payload', () => {
  const payload = buildNvidiaRequest({ imageDataUrl:'data:image/jpeg;base64,AAAA', game:'Riftbound', ocrText:'Platewyrm Egg' });
  assert.equal(DEFAULT_NVIDIA_URL, 'https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct');
  assert.equal(payload.model, 'meta/llama-3.2-11b-vision-instruct');
  assert.equal(payload.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.match(payload.messages[0].content[0].text, /Platewyrm Egg/);
});

test('home NIM adapter is OpenAI-compatible and permits model override', () => {
  const payload=buildHomeRequest({imageDataUrl:'data:image/png;base64,AAAA',game:'Yu-Gi-Oh!',model:'local-vision'});
  assert.equal(payload.model,'local-vision');
  assert.equal(payload.messages[0].content[1].image_url.url,'data:image/png;base64,AAAA');
});

test('model JSON is parsed and candidates are restricted to requested game', () => {
  const result=parseCandidates({choices:[{message:{content:'```json\n{"candidates":[{"name":"Platewyrm Egg","game":"Riftbound","setCode":"OGN-017","evidence":["name visible"]},{"name":"Wrong","game":"Yu-Gi-Oh!"}]}\n```'}}]},'Riftbound');
  assert.equal(result.length,1);
  assert.equal(result[0].name,'Platewyrm Egg');
});

test('invalid or hallucinated candidate response is rejected', () => {
  assert.throws(()=>parseCandidates({choices:[{message:{content:'not json'}}]},'Riftbound'));
  assert.deepEqual(parseCandidates({choices:[{message:{content:'{"candidates":[{"name":"Wrong","game":"Yu-Gi-Oh!"}]}'}}]},'Riftbound'),[]);
});

test('home endpoint rejects embedded credentials and non-http protocols', () => {
  assert.throws(()=>normalizeBaseUrl('file:///tmp/model'));
  assert.throws(()=>normalizeBaseUrl('https://user:pass@example.com'));
  assert.equal(normalizeBaseUrl('https://ai.example.test/'),'https://ai.example.test');
});
