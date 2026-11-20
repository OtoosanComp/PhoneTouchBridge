# TCG OP 0.4 — Smart Scanner

## Cambios
- La galería es ahora la entrada principal y no fuerza la cámara del navegador.
- La cámara queda como opción secundaria.
- Se conserva la fotografía original en IndexedDB.
- Se genera una copia de análisis con orientación EXIF, rotación manual, resolución de hasta 2600 px y ajuste suave de contraste.
- Se agregan controles para girar la fotografía 90 grados.
- OCR usa segmentación de bloque.

## Cómo probar
1. Despliega el contenido de esta carpeta en el mismo sitio Netlify.
2. En el formulario, pulsa **Elegir de galería** y selecciona una foto tomada con la cámara nativa del teléfono.
3. Si está girada, usa los botones de rotación.
4. Pulsa **Analizar fotografía y clasificar**.
5. Comprueba el texto detectado y la coincidencia del catálogo.
6. Solo confirma la ficha si nombre y código coinciden con la carta física.

## Importante
Esta actualización mejora la entrada y preparación de imágenes. No configura por sí sola el servicio cloud de visión ni garantiza identificación automática. La corrección de perspectiva automática por detección de esquinas queda para la siguiente iteración.
