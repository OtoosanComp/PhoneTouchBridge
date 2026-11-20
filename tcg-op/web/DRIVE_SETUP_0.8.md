# Configurar Google Drive para TCG OP 0.8

La aplicación crea una carpeta visible llamada `TCG_OP` y sube respaldos JSON versionados. El inventario principal sigue en IndexedDB/localStorage del teléfono; Drive no es la base de datos transaccional.

## Google Cloud
1. Entra a Google Cloud Console y crea/selecciona un proyecto.
2. Habilita **Google Drive API**.
3. Configura la pantalla de consentimiento OAuth. Durante pruebas puedes dejar la aplicación en modo Testing y añadir tu cuenta como usuario de prueba.
4. Crea credenciales OAuth Client ID para **Web application**.
5. En Authorized JavaScript origins añade el origen exacto de tu Netlify, por ejemplo `https://TU-SITIO.netlify.app`.
6. Copia el Client ID (termina en `.apps.googleusercontent.com`). No es una API key ni una contraseña.

## En TCG OP
1. Abre la aplicación publicada mediante HTTPS.
2. En Google Drive · Respaldo y sincronización pega el Client ID.
3. Pulsa Guardar configuración.
4. Pulsa Conectar y respaldar en Drive y autoriza tu cuenta.
5. Verifica que aparezca la carpeta `TCG_OP` en tu Google Drive.

## Comportamiento
- Sin internet: inventario y operaciones locales siguen disponibles.
- Cambios locales: quedan marcados como pendientes de respaldo.
- Con internet: pulsa Conectar y respaldar para subir un respaldo nuevo.
- Las fotos originales se conservan localmente y se incluyen en el JSON de respaldo cuando están disponibles.

No borres los datos del navegador hasta comprobar que el respaldo se subió y se puede descargar/importar.
