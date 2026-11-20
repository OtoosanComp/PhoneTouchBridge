# Crear la APK Android desde TCG OP 0.6

1. Publica primero el contenido de esta carpeta en el mismo proyecto Netlify y conserva el dominio.
2. Configura las variables del servidor indicadas en `NETLIFY_ENV_SETUP.md` y vuelve a desplegar.
3. Abre la URL HTTPS publicada y verifica que cargue la aplicación, el inventario y el panel de conexión IA.
4. Abre https://www.pwabuilder.com/ e introduce la URL HTTPS de TCG OP.
5. Revisa el informe PWA. Debe detectar `manifest.json`, iconos y Service Worker.
6. En Package for Stores / Android, genera el paquete Android disponible (APK para instalación de prueba o AAB para Play Store, según las opciones vigentes de PWABuilder).
7. Conserva el certificado / keystore y las credenciales de firma para futuras actualizaciones. No generes una firma nueva en cada versión.
8. Instala la APK y prueba inventario, reinicio, modo offline y selección de galería.

La APK es una envoltura de la PWA; las Netlify Functions y los modelos cloud siguen ejecutándose en el servidor. No incrustes claves NVIDIA en el paquete Android.
