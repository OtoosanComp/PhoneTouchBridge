export const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.2-11b-vision-instruct';
export const DEFAULT_NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct';
export const DEFAULT_HOME_PATH = '/v1/chat/completions';

export function makeVisionPrompt({ game, ocrText = '' }) {
  return `You are Tsuki, the card-identification specialist inside TCG OP. Analyze exactly one photographed trading card. Game: ${game}. OCR evidence (may contain errors): ${String(ocrText).slice(0, 5000)}. Return ONLY valid JSON with shape {"candidates":[{"name":"","game":"${game}","setCode":"","collectorNumber":"","setName":"","type":"","language":"","rarity":"","edition":"","visualDescription":"","evidence":[""]}]}. Keep card name and printed set/collector code in separate fields. Never guess. Use empty strings for unreadable fields. Do not infer foil/finish; the user chooses that separately. Do not infer price. If uncertain, return {"candidates":[]}. Do not identify a different game.`;
}

export function buildNvidiaRequest({ imageDataUrl, game, ocrText = '', model = DEFAULT_NVIDIA_MODEL }) {
  return {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: makeVisionPrompt({ game, ocrText }) },
        { type: 'image_url', image_url: { url: imageDataUrl } }
      ]
    }],
    max_tokens: 1200,
    temperature: 0.1,
    top_p: 0.7,
    stream: false
  };
}

export function buildHomeRequest(args) {
  return buildNvidiaRequest({ ...args, model: args.model || 'tcg-op-vision' });
}

export function extractModelText(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? payload?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('\n');
  throw new Error('El proveedor no devolvió texto de identificación.');
}

/** Estimación de precio de la IA: solo se acepta con forma válida y rango razonable; si no, se descarta. */
export function sanitizePriceEstimate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const low = Number(value.low), high = Number(value.high);
  const currency = String(value.currency || '').toUpperCase();
  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low || high > 1_000_000) return null;
  if (high / low > 20 || !['USD', 'MXN'].includes(currency)) return null;
  return {
    low: Math.round(low * 100) / 100, high: Math.round(high * 100) / 100, currency,
    basis: typeof value.basis === 'string' ? value.basis.trim().slice(0, 160) : '',
    confidence: value.confidence === 'medium' ? 'medium' : 'low'
  };
}

export function parseCandidates(payload, game, { allowPrice = false } = {}) {
  const raw = extractModelText(payload).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('La IA devolvió una respuesta que no es JSON válido.'); }
  if (!Array.isArray(parsed.candidates)) throw new Error('La IA no devolvió una lista de candidatos.');
  const fields = ['setCode','collectorNumber','setName','type','language','rarity','edition','visualDescription'];
  return parsed.candidates.slice(0, 5).filter(item =>
    item && typeof item.name === 'string' && item.name.trim() && item.game === game &&
    fields.every(key => item[key] === undefined || typeof item[key] === 'string') &&
    (item.evidence === undefined || (Array.isArray(item.evidence) && item.evidence.every(x => typeof x === 'string')))
  ).map(item => {
    const { priceEstimate, ...rest } = item;
    const estimate = allowPrice ? sanitizePriceEstimate(priceEstimate) : null;
    return { ...rest, name: item.name.trim(), evidence: Array.isArray(item.evidence) ? item.evidence.slice(0, 8) : [], ...(estimate ? { priceEstimate: estimate } : {}) };
  });
}

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('AI endpoint must use HTTP or HTTPS');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in AI endpoint URLs');
  return url.toString().replace(/\/$/, '');
}
