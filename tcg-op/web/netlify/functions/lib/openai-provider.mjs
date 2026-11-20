export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
export const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          game: { type: 'string', enum: ['Riftbound', 'Yu-Gi-Oh!'] },
          setCode: { type: 'string' },
          collectorNumber: { type: 'string' },
          setName: { type: 'string' },
          type: { type: 'string' },
          language: { type: 'string' },
          rarity: { type: 'string' },
          edition: { type: 'string' },
          visualDescription: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' }, maxItems: 8 }
        },
        required: ['name', 'game', 'setCode', 'collectorNumber', 'setName', 'type', 'language', 'rarity', 'edition', 'visualDescription', 'evidence']
      }
    }
  },
  required: ['candidates']
};

export function buildOpenAIRequest({ imageDataUrl, game, ocrText = '', model = DEFAULT_OPENAI_MODEL }) {
  const prompt = `You are Tsuki, the card-identification specialist inside TCG OP. Analyze exactly one photographed trading card. Game: ${game}. OCR evidence (may contain errors): ${String(ocrText).slice(0, 5000)}. Identify only what is visible and supported by the image. Keep card name and printed set/collector code in separate fields. Never guess or invent a printing, set code, collector number, rarity, language, edition, or type. Use empty strings for unreadable fields. Do not infer foil/finish; the user chooses that separately. Do not infer price or market value. Evidence must describe visible proof, not assumptions. If the image is unclear or no reliable candidate exists, return an empty candidates array. Never identify a different game.`;
  return {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
      ]
    }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'tcg_card_identification', strict: true, schema: CARD_SCHEMA }
    },
    max_completion_tokens: 900
  };
}
