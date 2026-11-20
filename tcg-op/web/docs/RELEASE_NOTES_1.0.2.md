# TCG OP 1.0.2 — Gemini también estima el precio

Cuando una carta solo se identifica con IA (no está en el catálogo local), antes no había de dónde sacar un precio. Ahora Gemini devuelve, en la **misma llamada** que identifica la carta, una estimación de rango de precio.

## Cómo funciona
- El prompt de Gemini pide `priceEstimate` (bajo, alto, moneda USD o MXN, base y confianza) para **esa impresión exacta** en near-mint, o `null` si no está razonablemente seguro.
- La app toma el **promedio del rango** y lo convierte a MXN con el tipo de cambio guardado (USD→MXN).
- Se muestra como **«Estimación de IA (Gemini), sin fuente verificable»**, con confianza baja o media, y queda registrada como fuente en la ficha. Puedes corregir el precio a mano.
- **La cotización local siempre tiene prioridad**: si el catálogo tiene precio de esa impresión, la estimación de la IA no se usa.
- Una estimación se descarta si tiene forma inválida, rango absurdo (alto > 20× el bajo), monedas distintas de USD/MXN o valores no positivos.
- Los factores manuales de edición/idioma no se aplican a la estimación de la IA (ya es para esa impresión).
- Solo aplica al proveedor Gemini; OpenAI, NVIDIA y servidor doméstico siguen sin devolver precios.
- Sin tiempo extra: va en la misma llamada, dentro del mismo presupuesto de 8.5 s.

## Limitaciones
- Es una estimación del conocimiento del modelo, no una consulta de mercado: puede estar desactualizada o equivocada. Por eso se marca así y no se guarda como cotización de fuente.
- Necesita el tipo de cambio USD→MXN de la biblioteca de catálogos (si nunca se descargó, avisa en vez de inventarlo).
- Una consulta real a precios actuales (búsqueda de Google) sería más fiable pero más lenta y puede no estar en el nivel gratuito; no se incluyó.
- No se probó contra Google real desde aquí.

## Pruebas
`npm test` → 95 aprobadas, 0 fallidas (7 nuevas en `tests/gemini-price-1.0.2.test.mjs`).
