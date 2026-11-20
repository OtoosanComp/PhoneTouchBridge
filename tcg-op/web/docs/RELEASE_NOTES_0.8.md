# TCG OP 0.8 — Local-first + Google Drive

## Cambios
- Inventario y fotografías originales permanecen en el almacenamiento local del navegador/dispositivo.
- Reconocimiento ya no consulta automáticamente proveedores de IA ni la API remota de Yu-Gi-Oh! en cada escaneo.
- Se ofrece una segunda opinión cloud únicamente mediante un botón explícito del usuario.
- Se incorpora respaldo JSON a una carpeta visible `TCG_OP` en Google Drive.
- El respaldo incluye las fotografías como datos embebidos cuando el almacenamiento local puede leerlas.
- Se registra el estado pendiente de respaldo al cambiar el inventario.
- Service worker actualizado a `tcg-op-shell-v08`.

## Configuración pendiente para Drive
1. Crear un proyecto en Google Cloud Console.
2. Habilitar Google Drive API.
3. Configurar OAuth consent screen.
4. Crear OAuth Client ID de tipo Web application.
5. Añadir el dominio de producción a Authorized JavaScript origins.
6. Pegar el Client ID en el panel Google Drive de TCG OP.
7. Autorizar y pulsar “Conectar y respaldar en Drive”.

Se usa el scope `drive.file`; la app crea y administra sus propios archivos/carpetas. No se solicita acceso general a todo el Drive.

## Limitaciones conocidas
- La primera conexión y autorización de Drive requieren internet.
- Los cambios offline quedan marcados como pendientes. Si Drive ya está autorizado en la sesión, se intenta subir un respaldo al recuperar conexión o después de guardar cambios. Tras recargar la app, puede requerirse una nueva autorización y pulsar el botón.
- El token OAuth vive en memoria de la sesión y puede requerir nueva autorización al recargar.
- El OCR de esta base todavía carga Tesseract desde CDN. El inventario, las fotos guardadas y la consulta de datos ya almacenados siguen siendo locales, pero el primer OCR sin caché no está garantizado en modo avión. Para OCR realmente offline desde la primera instalación falta empaquetar Tesseract, WASM y los datos de idioma `eng`/`spa` en `vendor/`.
- Los catálogos incluidos en el ZIP siguen siendo marcadores vacíos; deben descargarse desde la biblioteca cuando haya conexión.
- No se ha probado autorización real de Drive ni despliegue Netlify; requiere Client ID y dominio autorizados por el usuario.

## Seguridad
- No guardar tokens OAuth ni claves de proveedores en el código fuente.
- El Client ID de OAuth no es secreto; no introducir contraseñas ni API keys en el campo.
- La IA cloud no se invoca automáticamente.


### Compilación local-only para pruebas
- Google Drive queda reservado en el código, pero oculto y sin módulo de interfaz cargado.
- No se solicitan permisos, no se carga Google Identity y no se generan tareas pendientes de Drive.
- El inventario funciona localmente; los respaldos se realizan manualmente mediante JSON.
