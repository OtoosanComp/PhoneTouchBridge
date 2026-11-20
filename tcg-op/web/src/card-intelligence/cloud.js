import { validateVisionResult } from './core.js';
import { GEMINI_BASE_URL, GEMINI_RULES, DEFAULT_GEMINI_MODELS, buildGeminiRequest, geminiResponseToPayload, isPlausibleGeminiKey, shouldTryNextModel } from './gemini-shared.mjs';
import { parseCandidates } from './vision-parse.mjs';

const RETRYABLE = new Set([502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const GEMINI_KEY = 'tcg-op-gemini-key';
const TOKEN_KEY = 'tcg-op-access-token';
const MODEL_CACHE_KEY = 'tcg-op-gemini-models';
const MODEL_CACHE_MS = 3 * 24 * 60 * 60 * 1000;

const storage = () => globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const read = key => { try { return storage().getItem(key) || ''; } catch { return ''; } };

/** true dentro de la APK de Android: no hay funciones de Netlify en el mismo origen. */
export const isAndroidApp = () => Boolean(globalThis.TCGAndroid) || globalThis.location?.hostname === 'appassets.androidplatform.net';

/**
 * Segunda opinión con IA.
 * - Con clave propia de Gemini: el teléfono llama a Google directamente (sin Netlify y sin su límite de ~10 s).
 * - Sin clave de Gemini: usa la función de Netlify con la clave privada TCG OP (solo en la versión web).
 */
export async function requestCloudCandidates(args, fetcher = fetch, options = {}) {
  const geminiKey = read(GEMINI_KEY);
  if (geminiKey && options.via !== 'server') return requestGeminiDirect({ ...args, key: geminiKey }, fetcher, options);
  if (isAndroidApp()) throw new Error('Para usar IA en la app, pega tu clave de Gemini en Ajustes › opciones avanzadas.');
  return requestCloudCandidatesViaServer(args, fetcher, options);
}

/** Ruta clásica: función card-identify de Netlify. */
export async function requestCloudCandidatesViaServer({ imageDataUrl, game, ocrText }, fetcher = fetch, { retryDelayMs = 1500 } = {}) {
  const accessToken = read(TOKEN_KEY);
  const geminiKey = read(GEMINI_KEY);
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tcg-op-token': accessToken, ...(geminiKey ? { 'x-gemini-key': geminiKey } : {}) },
    body: JSON.stringify({ imageDataUrl, game, ocrText })
  };
  let response = null;
  let payload = {};
  // Gemini gratuito a veces tarda o se satura (502/503/504): un reintento automático suele bastar.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher('/.netlify/functions/card-identify', init);
    } catch {
      if (attempt === 0) { await sleep(retryDelayMs); continue; }
      throw new Error('No se pudo conectar con el servicio de IA. Revisa tu internet y reintenta.');
    }
    payload = await response.json().catch(() => ({}));
    if (response.ok || !RETRYABLE.has(response.status) || attempt === 1) break;
    await sleep(retryDelayMs);
  }
  if (!response?.ok) {
    throw new Error(payload.error || (response?.status === 504
      ? 'La IA tardó demasiado (504). Reintenta en unos segundos; el resultado local sigue disponible.'
      : `Cloud identification unavailable (${response?.status})`));
  }
  if (!Array.isArray(payload.candidates)) throw new Error('Cloud response has no candidates list');
  payload.candidates.forEach(validateVisionResult);
  return { candidates: payload.candidates, provider: payload.provider || 'cloud', model: payload.model || null };
}

/** Modelos a probar: alias estables de Google primero, luego los conocidos y los descubiertos con la clave del usuario. */
export function directModelOrder(discovered = []) {
  const preferred = ['gemini-flash-latest', 'gemini-flash-lite-latest', ...DEFAULT_GEMINI_MODELS];
  return [...new Set([...preferred, ...discovered])].slice(0, 6);
}

/** Lista los modelos «flash» que la clave puede usar con generateContent. Se guarda unos días. */
export async function discoverGeminiModels(key, fetcher = fetch, { force = false } = {}) {
  if (!force) {
    try {
      const cached = JSON.parse(read(MODEL_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < MODEL_CACHE_MS && Array.isArray(cached.models)) return cached.models;
    } catch { /* caché dañada: se vuelve a consultar */ }
  }
  const response = await fetcher(`${GEMINI_BASE_URL}?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`No se pudo listar modelos de Gemini (HTTP ${response.status}).`);
  const data = await response.json();
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, ''))
    .filter(name => /flash/i.test(name) && !/(image|tts|audio|live|embed|exp|preview-\d{2}-\d{2}|thinking)/i.test(name))
    .sort((a, b) => scoreModel(b) - scoreModel(a));
  try { storage().setItem(MODEL_CACHE_KEY, JSON.stringify({ at: Date.now(), models })); } catch { /* sin espacio: no pasa nada */ }
  return models;
}

function scoreModel(name) {
  const version = Number((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  return version * 10 + (/lite/.test(name) ? 0 : 1) - (/preview/.test(name) ? 0.5 : 0);
}

/** Llamada directa del teléfono a Gemini con la clave del usuario. */
export async function requestGeminiDirect({ imageDataUrl, game, ocrText, key }, fetcher = fetch, { perModelTimeoutMs = 25_000, totalBudgetMs = 60_000, retryDelayMs = 1200, onModel = () => {} } = {}) {
  if (!isPlausibleGeminiKey(key)) throw new Error('La clave de Gemini guardada no tiene un formato válido. Pégala de nuevo en Ajustes.');
  const body = JSON.stringify(buildGeminiRequest({ imageDataUrl, game, ocrText, rules: GEMINI_RULES }));
  const deadline = Date.now() + totalBudgetMs;
  const attempts = [];
  let discovered = false;
  let models = directModelOrder();
  let offline = 0;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const remaining = deadline - Date.now();
    if (remaining < 2_000) { attempts.push(`${model}: sin tiempo`); break; }
    onModel(model);
    let response;
    try {
      response = await fetcher(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(Math.min(perModelTimeoutMs, remaining))
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') { attempts.push(`${model}: sin respuesta`); continue; }
      if (++offline >= 2) throw new Error('No se pudo conectar con Gemini. Revisa tu internet y reintenta.');
      attempts.push(`${model}: sin conexión`);
      await sleep(retryDelayMs);
      i--; // mismo modelo, una vez más
      continue;
    }
    if (response.ok) {
      const candidates = parseCandidates(geminiResponseToPayload(await response.json()), game, { allowPrice: true });
      candidates.forEach(validateVisionResult);
      return { candidates, provider: 'gemini (directo)', model };
    }
    const detail = (await response.text().catch(() => '')).replaceAll(key, '[clave]').slice(0, 200);
    attempts.push(`${model}: HTTP ${response.status}`);
    if (response.status === 400 && /API key not valid|API_KEY_INVALID/i.test(detail)) throw new Error('Google rechazó la clave de Gemini. Revísala en Ajustes.');
    if (response.status === 403) throw new Error('La clave de Gemini no tiene permiso para este servicio (403). Revisa la clave en Google AI Studio.');
    if (!shouldTryNextModel(response.status)) throw new Error(`Gemini respondió un error: ${attempts.join(' | ')} ${detail}`);
    // Si los nombres conocidos ya no existen (404), se pregunta a Google qué modelos hay.
    if (response.status === 404 && !discovered) {
      discovered = true;
      try { models = [...new Set([...models, ...await discoverGeminiModels(key, fetcher, { force: true })])].slice(0, 10); }
      catch (error) { attempts.push(error.message); }
    }
    if (response.status === 429) await sleep(retryDelayMs);
  }
  const slow = attempts.some(a => a.includes('sin respuesta') || a.includes('sin tiempo'));
  throw new Error(slow
    ? 'Gemini tardó demasiado en responder. Reintenta en unos segundos; el resultado local sigue disponible.'
    : `Gemini no pudo identificar la carta ahora (${attempts.join(' | ')}).`);
}
