import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIRequest, DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_URL } from '../netlify/functions/lib/openai-provider.mjs';

test('OpenAI vision request sends one card image and strict structured output', () => {
  const request = buildOpenAIRequest({
    imageDataUrl: 'data:image/jpeg;base64,AAAA',
    game: 'Riftbound',
    ocrText: 'Platewyrm Egg',
  });
  assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-5.4-mini');
  assert.equal(DEFAULT_OPENAI_URL, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.model, DEFAULT_OPENAI_MODEL);
  assert.equal(request.messages[0].content[1].image_url.detail, 'high');
  assert.equal(request.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.max_completion_tokens, 900);
  assert.match(request.messages[0].content[0].text, /Platewyrm Egg/);
  assert.match(request.messages[0].content[0].text, /Never guess/);
});
