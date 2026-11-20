# TCG OP 1.0.1 — Gemini más estable (error 504)

Causa del 504: la función de Netlify esperaba hasta 55 s a Gemini y podía probar varios modelos seguidos, pero Netlify corta las funciones normales a ~10 s por defecto. Gemini con foto y razonamiento tarda más y Netlify respondía 504 antes de que Gemini contestara.

## Cambios (solo IA en la nube; identificación local, OCR, catálogos, precios e interfaz no cambian)
- Presupuesto de tiempo de 8.5 s en la función (`GEMINI_TIME_BUDGET_MS`, entre 1 y 24 s). Si se agota, responde un 504 claro con `retryable: true` en vez del 504 genérico de Netlify.
- Orden de modelos: primero el más rápido (`gemini-3.5-flash-lite`), luego `gemini-3.8-flash` y `gemini-3.7-flash`. Si uno está saturado (429/503) o no existe, pasa al siguiente sin esperar de más. Se puede fijar con `GEMINI_VISION_MODEL`.
- Petición más ligera: foto de 1280 px (antes 1600) a calidad 0.8 y respuesta de hasta 1200 tokens (antes 2000).
- La app reintenta automáticamente una vez ante 502/503/504 o fallo de red, y muestra mensajes claros. El resultado local siempre se conserva.
- Pruebas: `npm test` → 88 aprobadas, 0 fallidas (4 nuevas en `tests/gemini-timeout-1.0.1.test.mjs`).

## Limitaciones
- No se probó contra Google real desde aquí. Si el modelo rápido identifica peor, fija otro con `GEMINI_VISION_MODEL` (aumenta el riesgo de tardar).
- No se envía configuración de "razonamiento mínimo": los nombres de ese parámetro varían por modelo y un valor equivocado haría fallar la llamada.
