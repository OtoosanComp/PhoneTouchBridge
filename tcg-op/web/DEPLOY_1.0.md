# TCG OP 1.0 — Publicación en Netlify

## Publicar la interfaz
1. Descomprime `TCG_OP_1.0_NAKAMURA_TWINS.zip`.
2. Abre la carpeta `TCG_OP_1.0_NAKAMURA_TWINS`.
3. Publica **el contenido de esa carpeta** en el sitio de Netlify (Deploy manually / arrastrar y soltar), o sube estos archivos al repositorio conectado con Netlify.
4. Espera a que termine el deploy y abre la URL HTTPS del sitio.
5. En Android, recarga la página. Si tenías la PWA instalada, ciérrala y vuelve a abrirla para que el service worker `tcg-op-shell-v100` descargue los nuevos recursos.

## Configurar Gemini: dos modos

### A. Clave personal en el teléfono (más simple para probar)
- En TCG OP abre Ajustes.
- Activa «Mostrar opciones avanzadas (IA en la nube)».
- Pega tu clave de Google AI Studio en «Clave de Gemini».
- Pulsa «Guardar clave Gemini en este dispositivo».
- No necesitas agregar `GEMINI_API_KEY` ni `TCG_OP_ACCESS_TOKEN` a Netlify para esta modalidad: la función `card-identify` recibe la clave personal por HTTPS y consulta Gemini con esa clave.

La clave queda guardada en el almacenamiento local de ese navegador/dispositivo. No compartas el dispositivo ni la clave; para distribuir la app a otras personas conviene implementar autenticación individual y un proxy de servidor.

### B. Clave guardada en Netlify (modo servidor)
En Netlify → Project configuration → Environment variables agrega:
- `GEMINI_API_KEY`: tu clave de Google AI Studio.
- `TCG_OP_ACCESS_TOKEN`: secreto aleatorio privado de al menos 24 caracteres.

Después de guardar las variables, vuelve a desplegar las funciones. En TCG OP activa las opciones avanzadas y pega el valor de `TCG_OP_ACCESS_TOKEN` en «Clave privada de acceso TCG OP». **No pegues `GEMINI_API_KEY` en el campo de token de acceso.**

## Prueba rápida en producción
- Abrir Inicio y comprobar que aparecen el nuevo icono, Tsuki y Yami.
- Entrar en Escáner, tomar una foto o elegirla de Galería.
- Ejecutar lectura OCR: Tsuki debe aparecer con estado animado, sin porcentaje de progreso.
- Buscar impresión en catálogo y confirmar manualmente el resultado.
- Comprobar que Yami aparece durante la consulta de valoración; si no hay fuentes comparables, debe indicarlo sin inventar precio.
- Guardar una carta de prueba, verificar el inventario y generar su QR.
- Exportar un respaldo JSON antes de cargar datos reales.

## Alcance de esta versión
Esta entrega renueva interfaz, iconografía, avatares y estados visuales. La lógica de identificación, OCR, catálogos, inventario, valoración, QR, respaldo y funciones de Gemini se conserva; no se modificaron proveedores ni se añadió lógica de mercado.
