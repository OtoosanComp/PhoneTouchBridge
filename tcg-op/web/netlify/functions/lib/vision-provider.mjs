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

export { extractModelText, sanitizePriceEstimate, parseCandidates, VISION_GAMES } from '../../../src/card-intelligence/vision-parse.mjs';

export function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('AI endpoint must use HTTP or HTTPS');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in AI endpoint URLs');
  return url.toString().replace(/\/$/, '');
}
