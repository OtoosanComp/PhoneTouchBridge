# TCG OP 0.8.2 — Flujo por etapas para identificación

## Cambios
- Los campos de ficha, acabado, cantidad y valoración permanecen ocultos al iniciar.
- Tsuki tiene dos pasos visibles: (1) leer texto/códigos mediante OCR local y (2) buscar candidatos en el catálogo local.
- La ficha solo aparece cuando el usuario aplica un candidato devuelto por el catálogo.
- El botón de guardar permanece deshabilitado hasta aplicar un candidato.
- Se añadió el campo separado Passcode y se guarda junto con la ficha.
- Al cambiar la fotografía se invalidan lectura, candidato y ficha anterior.
- Riftbound conserva el flujo de catálogo existente; Drive sigue deshabilitado en esta compilación Local Only.

## Limitaciones conocidas
- El catálogo empaquetado de Yu-Gi-Oh! sigue requiriendo inicialización/actualización desde Biblioteca Card Intelligence; no se ha incluido una base completa de impresiones en este ZIP.
- El OCR continúa usando el proveedor Tesseract configurado por la versión base; este cambio no demuestra precisión de OCR en fotografías reales ni añade todavía calibración completa por regiones o idioma español.
- La búsqueda de catálogo actual es una primera etapa y aún requiere el trabajo de matching por código de impresión/passcode antes de considerarse identificación exacta.
- No se afirma que el reconocimiento de Yu-Gi-Oh! esté resuelto.

## Pruebas
- `npm test`: 53 pruebas aprobadas, 0 fallidas.
- Incluye cuatro pruebas nuevas del flujo por etapas y ocultación de campos.
