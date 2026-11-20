export default async request => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const homeConfigured = Boolean(process.env.HOME_AI_BASE_URL);
  const nvidiaConfigured = Boolean(process.env.NVIDIA_API_KEY);
  const provider = openaiConfigured ? 'openai-cloud' : geminiConfigured ? 'gemini-cloud' : homeConfigured ? 'home-cloud' : nvidiaConfigured ? 'nvidia-cloud' : 'local-only';
  const visionModel = openaiConfigured
    ? (process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini')
    : geminiConfigured ? (process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash')
    : homeConfigured ? (process.env.HOME_AI_MODEL || 'tcg-op-vision')
    : (process.env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-11b-vision-instruct');
  const configured = openaiConfigured || geminiConfigured || homeConfigured || nvidiaConfigured;
  return new Response(JSON.stringify({
    ok: true,
    provider,
    openaiConfigured,
    geminiConfigured,
    homeConfigured,
    nvidiaConfigured,
    accessControlConfigured: Boolean(process.env.TCG_OP_ACCESS_TOKEN),
    visionModel,
    message: openaiConfigured
      ? 'OpenAI Cloud configurado como proveedor principal.'
      : geminiConfigured ? 'Gemini configurado en el servidor.'
      : homeConfigured ? 'Servidor doméstico configurado.'
      : nvidiaConfigured ? 'NVIDIA Cloud configurado.'
      : 'Solo OCR y catálogo local. Pega tu clave de Gemini en la app (o añade OPENAI_API_KEY / GEMINI_API_KEY en Netlify) para activar visión cloud.'
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
};
