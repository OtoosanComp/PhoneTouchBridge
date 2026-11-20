TCG OP 0.8.1 — Local-first Card Intelligence + Dual Workflow Foundation

- Local OCR and catalog matching remain available offline.
- OpenAI vision is the primary cloud provider (gpt-5.4-mini by default).
- Optional home NIM and NVIDIA vision providers remain as fallbacks.
- Card name, set code and collector number are kept separate.
- Strict structured output and existing confidence checks prevent uncertain matches from being auto-confirmed.
- Tsuki and Yami remain roles in one shared engine.
- OpenAI/NVIDIA credentials remain server-side in Netlify; the app stores only the private TCG OP access token.

Setup: NETLIFY_ENV_SETUP.md
Architecture: ARCHITECTURE.md
Release notes: RELEASE_NOTES_0.7.md
Tests: npm test

TCG OP 0.8: Local-first + Google Drive
La base de inventario funciona localmente. Drive es respaldo opcional; requiere configurar OAuth Client ID siguiendo DRIVE_SETUP_0.8.md. La IA cloud solo se solicita con una acción explícita. Consulta RELEASE_NOTES_0.8.md para limitaciones conocidas, especialmente OCR offline.


Google Drive: integración reservada, deshabilitada y no accesible en esta compilación. El inventario y las fotos se guardan localmente. Usa Exportar respaldo JSON para crear copias manuales.

Dual Intelligence 0.8.1: Tsuki four-gate technical approval and Yami commercial workflow contract. See RELEASE_NOTES_0.8.1.md and TEST_RESULTS_0.8.1.txt. PWA screens and remote seller QR are not yet enabled.


TCG OP 0.8.3: lectura de códigos independiente del idioma (ES/EN), selector de impresión, precio que cambia con acabado/edición/idioma y ajustes manuales. Tras actualizar pulsa 'Descargar / actualizar catálogos'. Ver RELEASE_NOTES_0.8.3.md.

TCG OP 1.0.0: IA gratuita con Gemini (clave propia en Ajustes > opciones avanzadas). Ver RELEASE_NOTES_1.0.0.md.


TCG OP 1.1.0: APK nativa (tcg-op/android), OCR sin internet, Gemini directo desde el teléfono, registro manual y edición de inventario. Ver docs/RELEASE_NOTES_1.1.0.md.
