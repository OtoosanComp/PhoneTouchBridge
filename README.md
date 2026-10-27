# PhoneTouch Bridge MVP 0.1

Este proyecto envuelve el prototipo HTML en una app Android mínima con WebView. GitHub Actions genera un APK debug.

## Importante
Esta compilación es solo la interfaz táctil de prueba. Los botones y gestos todavía NO controlan el cursor del TV Box. Una app Android estándar en el Moto G82 sin root no puede convertirse automáticamente en mouse USB HID. Para control real se necesita comprobar soporte HID Gadget del teléfono o implementar y probar una conexión USB compatible más un receptor/servicio de accesibilidad en el TV Box.

## Compilar
1. Sube todos los archivos y carpetas de este proyecto a un repositorio GitHub.
2. Ve a Actions y ejecuta `Android APK`.
3. Descarga el artifact `PhoneTouchBridge-debug-apk`.
