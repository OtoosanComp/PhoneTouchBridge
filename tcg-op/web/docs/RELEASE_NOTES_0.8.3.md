# TCG OP 0.8.3 — Exactitud de códigos (español/inglés) y precio por acabado

## Qué fallaba (reproducido con pruebas)
- El guion del código se perdía al normalizar (`LOB-EN005` → `lob en005`), así que la coincidencia exacta casi nunca ocurría; con lectura perfecta el máximo era 0.93 y el umbral 0.94.
- El catálogo de YGOPRODeck solo trae nombres en inglés y códigos `-EN`: una carta en español (`MAGO OSCURO`, `LOB-SP005`) puntuaba 0 y la app mostraba el primer registro del catálogo ("siempre otro código").
- El passcode de 8 dígitos estaba en el catálogo pero no se usaba.
- Todas las impresiones de una carta empataban a 0.58 y el desempate era arbitrario.
- Dos rarezas con el mismo código (Ultra/Secret) se pisaban en IndexedDB.
- El precio exigía coincidir `finish` con la rareza; al cambiar acabado/edición nunca cambiaba.
- El OCR pasaba `tessedit_pageseg_mode` a `Tesseract.recognize`, que lo ignora en v5; se leía toda la carta como un bloque.

## Cambios
**Identificación**
- Código comparado por prefijo + número, ignorando idioma: `LOB-EN005 = LOB-SP005 = LOB-S005`. Tolera `L0B`, `SP0O5`, espacios y `OGN • 017/298`.
- Orden de evidencia: passcode → código de impresión → nombre (difuso). El nombre confirma; no decide la impresión.
- Si el OCR lee `SP`/`S`, el candidato conserva el código impreso real (`LOB-SP005`), idioma ES y guarda el código base del catálogo.
- Sin código legible: no finge una impresión; muestra un selector con todas las impresiones empatadas.
- `Dark Magician Girl` ya no empata con `Dark Magician`.
- Nombres en español: se aprenden al guardar una carta (título leído por OCR) y se pueden importar desde JSON (Biblioteca → "Importar nombres en español"). Se incluye un archivo base con 3 cartas.
- Edición impresa (`1st Edition`, `1ª Edición`, `Limited`) se sugiere automáticamente.
- Ids de impresión únicos por rareza. **Hay que pulsar "Descargar / actualizar catálogos" una vez** (la app detecta el cambio de esquema y vuelve a descargar).

**OCR (lectura por zonas)**
- Recorte automático del recuadro de la carta (si no hay certeza, usa la foto completa).
- 5 pasadas: nombre, código (zona media y baja con lista de caracteres permitidos), passcode (solo dígitos) y texto completo. Español+inglés para nombres, inglés para códigos.
- Si la lectura por zonas falla, vuelve a la lectura simple anterior.
- Tarda más (varias pasadas); la primera vez descarga el idioma español de Tesseract.

**Precio**
- Cambiar acabado, idioma o impresión recalcula el precio.
- YGO: cotización base de la impresión (por rareza) × factor de edición × factor de idioma.
- Riftbound: cotización real del acabado; el factor Foil solo se usa si no existe cotización foil (marcado como estimado, confianza baja).
- Los factores son **ajustes manuales editables** (panel "Ajustes de precio"). Valores iniciales: 1st Edition ×1.5, Limited ×1.2, Foil (sin cotización) ×2, resto ×1. No son datos de mercado.
- Precio editable a mano; queda marcado como "Ajuste manual del propietario".
- Si no hay cotización de la impresión, se muestra el piso de la carta (impresión más barata) solo como referencia; nunca se usa como precio de la impresión.

## Limitaciones conocidas
- La lectura por zonas **no se ha probado con fotografías reales** (aquí no hay navegador ni descarga de Tesseract). La lógica de códigos, catálogo, puntajes y precios sí está probada (70 pruebas). Si una foto no lee bien, el cuadro "Evidencia OCR" muestra qué leyó cada zona.
- La identificación por nombre en español depende de nombres aprendidos/importados; por código o passcode no hace falta.
- YGOPRODeck no tiene idioma español; no se verificó una fuente gratuita de nombres en español para descarga masiva.
- El precio de YGOPRODeck es indicativo (en dólares) y no distingue 1st Edition/Unlimited ni idioma.
- Foil/rareza especial no se puede detectar por foto; se elige en el selector.

## Pruebas
- `npm test`: 70 aprobadas, 0 fallidas (17 nuevas en `tests/accuracy-0.8.3.test.mjs`).
