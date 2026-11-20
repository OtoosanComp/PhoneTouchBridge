# TCG OP · Nakamura Twins Studio

```
tcg-op/
├── web/       App (HTML + JS). Se publica tal cual en Netlify y también va dentro de la APK.
└── android/   Proyecto Android (WebView nativa) que empaqueta web/ en la APK.
```

Notas de la versión: [`web/docs/RELEASE_NOTES_1.1.0.md`](web/docs/RELEASE_NOTES_1.1.0.md)

## Instalar la APK
1. **Antes**, en la app que ya tienes: Ajustes › **Exportar respaldo JSON** (incluye las fotos).
2. Instala `TCG-OP-1.1.0-release.apk` (Android pedirá permitir «instalar apps desconocidas»).
3. Abre TCG OP 1.1 › Ajustes › **Importar respaldo** y elige el JSON.
4. En Ajustes › opciones avanzadas pega tu clave de Gemini (y vuelve a descargar los catálogos).
5. Cuando compruebes que todo está, puedes desinstalar la app anterior.

La APK nueva tiene su propio paquete (`com.nakamuratwins.tcgop`), así que se instala **al lado** de la app hecha con PWABuilder; no la reemplaza. Los datos de cada app están separados, por eso hay que pasar el respaldo.

## Compilar una nueva versión
1. Sube `versionName` y `versionCode` en `android/app/build.gradle` (versionCode siempre mayor).
2. Firma **siempre con la misma llave** (`tcg-op-release.jks`). Con otra llave Android no deja actualizar y habría que desinstalar (perdiendo los datos).

### En GitHub Actions
En el repositorio: Settings › Secrets and variables › Actions, crea:
- `TCG_OP_KEYSTORE_BASE64`: el archivo `.jks` en base64 (`base64 -w0 tcg-op-release.jks`).
- `TCG_OP_KEYSTORE_PASSWORD`, `TCG_OP_KEY_PASSWORD`: la contraseña (ambas iguales).
- `TCG_OP_KEY_ALIAS`: `tcgop`.

Después ejecuta el flujo **TCG OP APK** (pestaña Actions) y descarga el artifact `TCG-OP-apk`.

### En una computadora
Con Android SDK y JDK 17+: coloca `tcg-op-release.jks` y `keystore.properties` dentro de `android/` (están en `.gitignore`) y ejecuta `./gradlew assembleRelease` en `android/`.

## Probar la parte web
`cd web && npm test`
