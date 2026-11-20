import { isAuthorized } from './lib/access.mjs';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_URL, buildOpenAIRequest } from './lib/openai-provider.mjs';
import {
  DEFAULT_NVIDIA_MODEL, DEFAULT_NVIDIA_URL, DEFAULT_HOME_PATH,
  buildNvidiaRequest, buildHomeRequest, parseCandidates, normalizeBaseUrl
} from './lib/vision-provider.mjs';
import { GEMINI_BASE_URL, GEMINI_RULES, buildGeminiRequest, geminiModels, geminiResponseToPayload, geminiTimeBudgetMs, isPlausibleGeminiKey, shouldTryNextModel } from './lib/gemini-provider.mjs';

const ALLOWED_GAMES = new Set(['Riftbound', 'Yu-Gi-Oh!']);
const MAX_IMAGE_CHARS = 5_500_000;
const ALLOWED_IMAGE = /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i;
const IDENTIFICATION_RULES = 'Return only identification evidence. Never output market prices, values, invented set codes, or guessed rarity. The catalog and human confirmation are authoritative.';

export default async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // Modo "clave propia": si el teléfono envía su clave de Gemini, la llamada se hace con ESA cuota y no hace falta TCG_OP_ACCESS_TOKEN.
  const userGeminiKey = isPlausibleGeminiKey(request.headers.get('x-gemini-key')) ? request.headers.get('x-gemini-key') : '';
  if (!userGeminiKey) {
    const accessSecret = process.env.TCG_OP_ACCESS_TOKEN;
    if (!accessSecret) return json({ error: 'AI endpoint is locked: configure TCG_OP_ACCESS_TOKEN in Netlify first.' }, 503);
    if (!isAuthorized(request.headers.get('x-tcg-op-token'), accessSecret)) return json({ error: 'Unauthorized. Configure your private TCG OP access key in the app.' }, 401);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!ALLOWED_GAMES.has(body.game)) return json({ error: 'Unsupported TCG game' }, 400);
  if (typeof body.imageDataUrl !== 'string' || !ALLOWED_IMAGE.test(body.imageDataUrl)) return json({ error: 'A valid JPEG, PNG or WebP image is required' }, 400);
  if (body.imageDataUrl.length > MAX_IMAGE_CHARS) return json({ error: 'Image is too large; choose a smaller photo' }, 413);

  const args = { imageDataUrl: body.imageDataUrl, game: body.game, ocrText: typeof body.ocrText === 'string' ? body.ocrText.slice(0, 5000) : '' };
  const attempts = [];
  const homeUrl = process.env.HOME_AI_BASE_URL;
  const homeKey = process.env.HOME_AI_API_KEY || '';
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const priority = userGeminiKey ? ['gemini'] : (process.env.AI_PROVIDER_PRIORITY || 'openai,gemini,home,nvidia').split(',').map(x => x.trim());
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = userGeminiKey || process.env.GEMINI_API_KEY;

  let timedOut = false;
  for (const provider of priority) {
    try {
      let endpoint, key, model, payload;
      if (provider === 'gemini') {
        if (!geminiKey) continue;
        const result = await callGemini({ key: geminiKey, models: geminiModels(process.env.GEMINI_VISION_MODEL), args, game: body.game });
        return json({ candidates: result.candidates, provider: 'gemini', model: result.model, twinRoles: { tsuki: 'identification', yami: 'market_and_inventory', sharedEngine: true } });
      }
      if (provider === 'openai' && openaiKey) {
        endpoint = process.env.OPENAI_API_URL || DEFAULT_OPENAI_URL;
        key = openaiKey;
        model = process.env.OPENAI_VISION_MODEL || DEFAULT_OPENAI_MODEL;
        payload = buildOpenAIRequest({ ...args, model });
      } else if (provider === 'home' && homeUrl) {
        endpoint = normalizeBaseUrl(homeUrl) + (process.env.HOME_AI_CHAT_PATH || DEFAULT_HOME_PATH);
        key = homeKey;
        model = process.env.HOME_AI_MODEL || 'tcg-op-vision';
        payload = buildHomeRequest({ ...args, model });
      } else if (provider === 'nvidia' && nvidiaKey) {
        endpoint = process.env.NVIDIA_API_URL || DEFAULT_NVIDIA_URL;
        key = nvidiaKey;
        model = process.env.NVIDIA_VISION_MODEL || DEFAULT_NVIDIA_MODEL;
        payload = buildNvidiaRequest({ ...args, model });
      } else continue;

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ ...payload, messages: [{ role: 'user', content: [...payload.messages[0].content, { type: 'text', text: IDENTIFICATION_RULES }] }] }),
        signal: AbortSignal.timeout(55_000)
      });
      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 400);
        attempts.push(`${provider}: HTTP ${upstream.status} ${detail}`);
        continue;
      }
      const result = await upstream.json();
      const candidates = parseCandidates(result, body.game);
      return json({ candidates, provider, model, twinRoles: { tsuki: 'identification', yami: 'market_and_inventory', sharedEngine: true } });
    } catch (error) {
      if (error?.code === 'TIMEOUT') timedOut = true;
      attempts.push(`${provider}: ${String(error.message || error).slice(0, 220)}`);
    }
  }
  if (timedOut) return json({ error: 'Gemini tardó demasiado en responder. Reintenta en unos segundos; el resultado local sigue disponible.', retryable: true }, 504);
  const configured = Boolean(openaiKey || geminiKey || homeUrl || nvidiaKey);
  return json({ error: configured ? `No AI provider responded. ${attempts.join(' | ')}` : 'Cloud AI is not configured. Local OCR and catalog search remain available.' }, configured ? 502 : 503);
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function callGemini({ key, models, args, game }) {
  const attempts = [];
  const budget = geminiTimeBudgetMs();
  const deadline = Date.now() + budget;
  for (const [index, model] of models.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) { attempts.push(`${model}: sin tiempo restante`); break; }
    // Los modelos no finales usan ~60% del tiempo para dejar margen a un segundo intento.
    const slice = index === models.length - 1 ? remaining : Math.min(remaining, Math.max(3_500, Math.floor(remaining * 0.6)));
    let upstream;
    try {
      upstream = await fetch(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildGeminiRequest({ ...args, rules: GEMINI_RULES })),
        signal: AbortSignal.timeout(slice)
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        attempts.push(`${model}: sin respuesta en ${Math.round(slice / 1000)} s`);
        if (index === models.length - 1 || deadline - Date.now() < 1_500) throw Object.assign(new Error(attempts.join(' | ')), { code: 'TIMEOUT' });
        continue;
      }
      throw error;
    }
    if (!upstream.ok) {
      const detail = (await upstream.text()).replaceAll(key, '[clave]').slice(0, 300);
      attempts.push(`${model}: HTTP ${upstream.status} ${detail}`);
      if (shouldTryNextModel(upstream.status)) continue;
      throw new Error(attempts.join(' | '));
    }
    return { candidates: parseCandidates(geminiResponseToPayload(await upstream.json()), game, { allowPrice: true }), model };
  }
  const slow = attempts.some(a => a.includes('sin respuesta') || a.includes('sin tiempo'));
  throw Object.assign(new Error(attempts.join(' | ') || 'Gemini no respondió'), slow ? { code: 'TIMEOUT' } : {});
}
