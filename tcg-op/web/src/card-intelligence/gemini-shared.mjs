
// Módulo compartido (navegador + Netlify): sin process.env ni APIs de Node.
// Los nombres de modelo de Gemini cambian seguido: se prueban en orden y se pueden fijar con GEMINI_VISION_MODEL (lista separada por comas).
// Primero el modelo más rápido: Netlify corta las funciones normales a ~10 s, así que no hay tiempo para modelos lentos primero.
export const DEFAULT_GEMINI_MODELS = Object.freeze(['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.7-flash']);

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiModels(value = '') {
  const list = String(value || '').split(',').map(s => s.trim()).filter(m => /^[a-z0-9][a-z0-9.\-]{2,60}$/i.test(m));
  return list.length ? list : [...DEFAULT_GEMINI_MODELS];
}

export function isPlausibleGeminiKey(value) {
  return /^[A-Za-z0-9._\-]{20,200}$/.test(String(value || ''));
}

export const GEMINI_RULES = 'Return only JSON. Identification fields come from what is printed or visible on the card; never invent set codes or guess rarity. priceEstimate is optional: use null whenever you are not reasonably sure. The local catalog and human confirmation remain authoritative.';

function describeGame(game) {
  return game === 'Otro'
    ? 'any trading card game other than Riftbound, Yu-Gi-Oh!, Pokémon or Magic (write the real game name at the start of setName, e.g. "One Piece Card Game · Romance Dawn"; the game field must still be "Otro")'
    : game;
}

export function makeGeminiPrompt({ game, ocrText = '' }) {
  return `You are Tsuki, the card-identification specialist inside TCG OP, with Yami's market sense. Analyze exactly one photographed trading card. Game: ${describeGame(game)}. OCR evidence (may contain errors): ${String(ocrText).slice(0, 5000)}. Return ONLY valid JSON with shape {"candidates":[{"name":"","game":"${game}","setCode":"","collectorNumber":"","setName":"","type":"","language":"","rarity":"","edition":"","visualDescription":"","evidence":[""],"priceEstimate":{"low":0,"high":0,"currency":"USD","basis":"","confidence":"low"}}]}. Keep card name and printed set/collector code in separate fields. Never guess identification fields; use empty strings for unreadable ones. Do not infer foil/finish; the user chooses that separately. priceEstimate: your best estimate of the typical current market price range in USD for THIS exact printing (set code, rarity, language, edition) in near-mint condition, based on what you know of recent sales. confidence is "low" or "medium" only; basis is one short sentence. If you do not know the typical price of this exact printing, set priceEstimate to null; prefer null over guessing. If uncertain about the card, return {"candidates":[]}. Do not identify a different game.`;
}

export function buildGeminiRequest({ imageDataUrl, game, ocrText = '', rules = '' }) {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageDataUrl || ''));
  if (!match) throw new Error('A valid JPEG, PNG or WebP image is required');
  const mime = `image/${match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()}`;
  return {
    contents: [{ role: 'user', parts: [
      { text: `${makeGeminiPrompt({ game, ocrText })} ${rules}`.trim() },
      { inline_data: { mime_type: mime, data: match[2] } }
    ] }],
    // Sin temperature/top_p: los modelos Gemini recientes los desaconsejan.
    // 4096: los modelos con «thinking» descuentan su razonamiento de este límite; con 1200 a veces no quedaba espacio para el JSON.
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 }
  };
}

/** Adapta la respuesta de Gemini al formato que ya entiende parseCandidates(). */
export function geminiResponseToPayload(data) {
  const text = (data?.candidates?.[0]?.content?.parts || []).map(part => part?.text || '').join('').trim();
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'sin texto';
    throw new Error(`Gemini no devolvió identificación (${reason}).`);
  }
  return { output_text: text };
}

export const shouldTryNextModel = status => [400, 404, 429, 500, 502, 503, 504].includes(status);
