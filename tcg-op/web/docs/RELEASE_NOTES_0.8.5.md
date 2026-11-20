# TCG OP 0.8.5 — IA gratuita con Gemini (clave propia)

- Nuevo proveedor **Gemini** en la función de Netlify (`netlify/functions/lib/gemini-provider.mjs`).
- **Clave propia por dispositivo**: en Ajustes → "Mostrar opciones avanzadas" pega tu clave de Google AI Studio. Se guarda solo en el teléfono y se envía por HTTPS a tu función, que la usa con tu cuota gratuita. Con esto **no hace falta** configurar variables en Netlify ni `TCG_OP_ACCESS_TOKEN`.
- Alternativa en servidor: variable `GEMINI_API_KEY` (y opcional `GEMINI_VISION_MODEL`, lista separada por comas). Prioridad por defecto: `openai,gemini,home,nvidia`.
- Los nombres de modelo de Gemini cambian seguido: se prueban en orden `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash-lite` y se pasa al siguiente si uno no existe o está sin cuota.
- La clave **no está en el código ni en el zip**. Los errores del proveedor se limpian para no exponerla.
- Los botones de IA solo aparecen si hay clave guardada (Gemini o token privado).
- La IA solo ayuda a **identificar**; el precio sigue siendo local/manual.
- Nota de privacidad: en el nivel gratuito Google puede usar el contenido enviado para mejorar sus productos.
- Pruebas: `npm test` → 80 aprobadas (5 nuevas en `tests/gemini-provider.test.mjs`). La llamada real a Google no se pudo probar desde aquí; la primera identificación con IA en tu teléfono es la prueba completa.
