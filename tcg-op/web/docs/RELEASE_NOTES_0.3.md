# TCG OP 0.3 — Formulario guiado por fotografía

## Cambios
- Se separan `Nombre de carta` y `Código de colección`.
- Se agregan campos bloqueados para expansión/set, tipo, rareza, idioma y edición.
- El análisis rellena campos separados y el juego queda bloqueado después de aplicar la coincidencia.
- La única clasificación editable es `Versión / acabado`, con opciones según franquicia. La cantidad sigue editable por ser un dato de inventario.
- La fotografía se almacena en IndexedDB local, vinculada al registro.
- La fotografía puede abrirse desde el inventario.
- Los respaldos JSON incluyen las fotos y la importación las restaura en IndexedDB.
- Los precios no se inventan. Si no hay fuente de mercado, se guarda como `null` y se muestra `Sin cotización`.
- El modelo visual recibe instrucciones para leer nombre, código, set, tipo, idioma, rareza y edición; no debe decidir el acabado ni inventar precios.

## Límites pendientes
- El proveedor cloud todavía debe configurarse en Netlify (`CARD_AI_ENDPOINT`, `CARD_AI_API_KEY`).
- La fuente de precios MXN aún no está conectada.
- El catálogo Riftbound autorizado aún está pendiente.
- No se ha ejecutado prueba real de cámara ni IndexedDB en el teléfono del usuario.

## Instalación
Descomprimir el ZIP y desplegar el contenido de la carpeta como nuevo deploy del mismo sitio Netlify. No borrar los datos del navegador. Antes del deploy, exportar un respaldo JSON desde la versión actual.
