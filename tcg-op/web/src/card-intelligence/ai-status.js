const $ = id => document.getElementById(id);
const tokenInput = $('aiAccessToken');
const status = $('aiConnectionStatus');
const TOKEN_KEY = 'tcg-op-access-token';
const GEMINI_KEY = 'tcg-op-gemini-key';
const geminiInput = $('geminiKeyInput');
const geminiStatus = $('geminiKeyStatus');
if (!tokenInput || !status) { /* UI is not present on an older shell */ }
else {
  tokenInput.value = localStorage.getItem(TOKEN_KEY) || '';
  if (geminiInput) geminiInput.value = localStorage.getItem(GEMINI_KEY) || '';
  $('saveGeminiKeyBtn')?.addEventListener('click', () => {
    const key = geminiInput.value.trim();
    if (!key) { localStorage.removeItem(GEMINI_KEY); geminiStatus.textContent = 'Clave de Gemini eliminada de este dispositivo.'; return; }
    if (!/^[A-Za-z0-9._-]{20,200}$/.test(key)) { geminiStatus.textContent = 'La clave no tiene un formato válido. Cópiala completa desde Google AI Studio.'; return; }
    localStorage.setItem(GEMINI_KEY, key);
    geminiStatus.textContent = 'Clave de Gemini guardada solo en este teléfono. Ya aparecen los botones de IA al identificar.';
  });
  $('saveAiTokenBtn')?.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) { localStorage.removeItem(TOKEN_KEY); status.textContent = 'Clave local eliminada. La IA cloud quedará bloqueada.'; return; }
    if (token.length < 24) { status.textContent = 'La clave debe tener al menos 24 caracteres.'; return; }
    localStorage.setItem(TOKEN_KEY, token);
    status.textContent = 'Clave guardada únicamente en este dispositivo.';
  });
  $('checkAiBtn')?.addEventListener('click', async () => {
    const button = $('checkAiBtn'); button.disabled = true; status.textContent = 'Consultando configuración…';
    try {
      const response = await fetch('/.netlify/functions/ai-status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const hasToken = Boolean(localStorage.getItem(TOKEN_KEY));
      if (localStorage.getItem(GEMINI_KEY)) { status.textContent = 'Modo Gemini propio: clave local presente. No necesitas variables en Netlify; la primera identificación real es la prueba completa.'; status.style.color = '#72dfa5'; return; }
      status.textContent = `${data.message} · Control de acceso: ${data.accessControlConfigured ? (hasToken ? 'clave local presente' : 'falta pegar tu clave privada') : 'falta configurar TCG_OP_ACCESS_TOKEN en Netlify'} · Modelo: ${data.visionModel}.`;
      status.style.color = data.accessControlConfigured && hasToken && (data.openaiConfigured || data.homeConfigured || data.nvidiaConfigured) ? '#72dfa5' : '#e7c18c';
    } catch (error) {
      status.textContent = `No se pudo consultar el estado cloud: ${error.message}. El motor local sigue disponible.`;
      status.style.color = '#ff9eaf';
    } finally { button.disabled = false; }
  });
}
