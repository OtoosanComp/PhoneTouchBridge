# TCG OP 1.1.0 — APK nativa, OCR sin internet y Gemini directo

## APK Android propia (`com.nakamuratwins.tcgop`)
- La app web viaja **dentro** de la APK y se sirve desde un origen seguro propio. Abre sin internet y no depende de Netlify.
- Cámara y galería nativas, diálogos nativos, botón Atrás que navega entre pestañas, enlaces externos en el navegador.
- «Exportar respaldo JSON» abre el selector de archivos de Android para elegir dónde guardarlo (en WebView las descargas normales no funcionan).
- Firmada con una llave propia: las siguientes versiones se instalan **encima** sin perder datos, siempre que se firmen con la misma llave.

## OCR sin internet
- Tesseract (motor, núcleo WASM y datos de inglés y español) viene incluido en `vendor/tesseract`. Antes se descargaba de una CDN y fallaba sin conexión.
- Los motores OCR se reutilizan entre fotos: la segunda lectura es aproximadamente el doble de rápida (se liberan tras 3 min sin uso).
- El generador de QR también es local.

## IA (Gemini)
- Con clave propia de Gemini, el teléfono llama a Google **directamente**: ya no pasa por la función de Netlify ni por su límite de ~10 s (causa de los errores 504). Espera hasta 25 s por modelo.
- Se prueban primero los alias estables `gemini-flash-latest` y `gemini-flash-lite-latest`; si Google retira un nombre (404), la app consulta con tu clave qué modelos hay y usa el más reciente.
- «Contrastar con IA» reutiliza la lectura OCR y la foto ya girada: antes repetía todo el OCR y enviaba la foto sin girar.
- La IA ahora identifica **Pokémon, Magic y otros juegos** (antes solo Riftbound y Yu-Gi-Oh!, por lo que esas cartas no se podían registrar).
- Si falta el tipo de cambio USD/MXN, se obtiene al momento en vez de pedir descargar todos los catálogos.
- Mensajes claros para clave inválida, sin permiso, sin internet o tiempo agotado. La clave nunca aparece en los errores.
- La función de Netlify sigue disponible para la versión web (modo servidor con `TCG_OP_ACCESS_TOKEN`).

## Inventario
- **Registro manual**: botón «Registrar manualmente» para capturar a mano nombre, código, set, rareza, idioma y precio (foto opcional).
- **Sin duplicados**: al guardar la misma impresión con el mismo acabado e idioma, ofrece sumar la cantidad al registro existente.
- **Editar**: cambia precio y cantidad de cualquier carta desde Colección.
- Visor de fotos dentro de la app (antes abría una pestaña que en Android no funcionaba).
- Recordatorio del último respaldo exportado.

## Versión web (Netlify)
- El service worker pide primero la red para la página: las actualizaciones llegan al abrir la app, sin quedarse con la versión vieja.
- Todos los módulos que carga la app están en la caché offline (lo verifica una prueba).

## Pruebas
`npm test` → 108 aprobadas, 0 fallidas (13 nuevas). Prueba de navegador simulando la APK: OCR local, IA simulada, registro manual, suma de duplicados, edición, visor, QR y respaldo, sin errores de consola.

## No probado aquí
- La APK no se ejecutó en un teléfono o emulador (este entorno no tiene emulador). La capa web se probó en Chromium.
- Gemini real: se probó con respuestas simuladas, sin una clave real.
