# TCG OP 0.8.4 — Navegación por pestañas y app más limpia

- Barra inferior con tres pestañas: **Registrar**, **Inventario**, **Ajustes** (el botón atrás del teléfono funciona entre pestañas).
- **Inventario**: solo título, buscador, resumen (piezas · registros · valor estimado) y la lista debajo. El QR de cada ficha se abre ahí mismo.
- **Ajustes**: respaldo (exportar/importar), biblioteca de catálogos, ajustes de precio (plegado) e instalar app.
- **IA en la nube oculta por defecto**: aparece solo si activas "Mostrar opciones avanzadas". Los botones "Contrastar con IA" / "Segunda opinión" solo se muestran si hay una clave guardada en el dispositivo.
- Corregido un `<div>` sin cerrar en el formulario de registro: el aviso y el botón "Guardar" salían en dos columnas; ahora ocupan todo el ancho.
- Sin cambios en identificación, OCR ni precios (0.8.3).
- Pruebas: `npm test` → 75 aprobadas.
