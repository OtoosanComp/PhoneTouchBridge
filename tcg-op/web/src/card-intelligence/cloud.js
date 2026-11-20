import { validateVisionResult } from './core.js';

const RETRYABLE = new Set([502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function requestCloudCandidates({ imageDataUrl, game, ocrText }, fetcher = fetch, { retryDelayMs = 1500 } = {}) {
  const accessToken = localStorage.getItem('tcg-op-access-token') || '';
  const geminiKey = localStorage.getItem('tcg-op-gemini-key') || '';
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
