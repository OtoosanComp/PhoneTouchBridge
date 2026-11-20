# TCG OP Card Intelligence 0.7 — Local-first OpenAI / Home NIM / NVIDIA hybrid

## Product rules

1. Exact printing and finish must match before comparing prices.
2. OCR, vision and catalogs are evidence sources; none may invent missing facts.
3. A user must confirm a suggested card before it enters inventory.
4. A learning example is stored only when the user actually saves the confirmed card.
5. Catalogs and learning memory live in IndexedDB. Existing inventory and photos retain their prior storage keys.
6. Prices are independent from identity. A catalog match is not a market quote.
7. Tsuki and Yami are two role modules inside one shared Card Intelligence engine, not separate models or databases.

## Catalog ingestion

### Riftbound
- `https://api.rifthunt.com/bulk/cards`
- `https://api.rifthunt.com/bulk/prices`
- Cards and price rows are joined only by exact `printing_id` / `printingId`, never by Riot's non-unique `riftbound_id` alone.
- Finish-specific quotes are kept separate (`normal` vs `foil`).
- Refresh is throttled locally to at most once per 20 hours. The source asks clients to download bulk data once rather than crawl it.

### Yu-Gi-Oh!
- `https://db.ygoprodeck.com/api/v7/checkDBVer.php` is checked first.
- When the version changes, download the complete `cardinfo.php` dataset and map each `card_sets[]` entry as a separate printing.
- `card_sets[].set_price` is retained as an indicative per-set reference, not represented as a multi-market average.
- The API's card-level `card_prices[]` is deliberately not copied onto every printing because that could assign a price to the wrong set/rarity.
- Respect the provider's 20 requests/second rate limit and local-storage recommendation.

### Storage
- `TCGOPIntelligence` IndexedDB database has `catalog`, `metadata`, and `learning` stores.
- Full card-art images are not bulk-downloaded. Catalog image URLs remain references; Riot-owned Riftbound assets require compliance with Riot's app policy.
- Browser storage quotas still apply. `navigator.storage.persist()` is requested during catalog sync when available; the browser may deny it.

## Fair Market Engine

- Quotes are filtered by exact printing ID and finish.
- Currency conversion is performed only with a successfully retrieved USD/MXN rate from Frankfurter; without a rate, USD quotes are not displayed as MXN.
- Outliers are filtered using median absolute deviation (with IQR fallback).
- The reported central value is the median, not the lowest listing.
- Fewer than three comparable quotes are labelled as an indicative reference with low confidence. Three or more comparable quotes are eligible for a median market estimate.
- No quote means no price. A YGO card-level quote is not treated as a printing quote.
- Current 0.5 feeds Riftbound with RiftHunt's TCGplayer printing/finish quotes and Yu-Gi-Oh! with YGOPRODeck's indicative set price. Multi-market aggregation for each YGO printing and Mexico-local sold-price data remain future integrations; this release does not claim a fully representative Mexico-wide market average.

## Learning Memory

- Only human-confirmed saved cards create learning records.
- Memory stores game, catalog printing ID, normalized card-name alias, OCR fingerprint and timestamp.
- Matching memory can modestly raise the score for that same game and exact known alias.
- It does not train model weights, learn from unconfirmed suggestions, or silently override catalog data.

## Twin roles — one engine

- Tsuki: OCR evidence, catalog matching, printing verification and ambiguity checks.
- Yami: market quote selection, price explanation and inventory/business workflows.
- Both use the same catalog, shared learning memory and common decision output.

## Current limits

- Cloud vision provider remains unconfigured; local OCR + catalog matching are available.
- The catalog download button must be used once while online before offline catalog lookup is possible.
- The first YGO bulk download can be large and take time on mobile. Do not close the page during sync.
- RiftHunt currently provides a single TCGplayer quote per printing/finish; this is a reference, not a multi-source fair-market average.
- No automatic card-image mirroring is enabled.


## OpenAI / NVIDIA / Home AI provider layer (0.7)

- Cloud vision uses NVIDIA's documented `meta/llama-3.2-11b-vision-instruct` model endpoint at `https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct` and sends image data URIs as multimodal user content.
- Optional home endpoint uses an OpenAI-compatible `POST /v1/chat/completions` route. Configure it with `HOME_AI_BASE_URL`, `HOME_AI_CHAT_PATH`, and `HOME_AI_MODEL`.
- Provider order defaults to `openai,home,nvidia`; failed providers fall through to the next configured provider. OpenAI uses `gpt-5.4-mini` by default and strict JSON Schema output.
- OpenAI, NVIDIA and home credentials remain server-side in Netlify environment variables. The PWA only stores a personal TCG OP access token on the device.
- `TCG_OP_ACCESS_TOKEN` is required by the personal vision proxy. This shared-token gate is a personal prototype safeguard, not a complete multi-user authentication system.
- `ai-status` reports configuration flags only; it does not perform a paid / rate-limited inference health check. The first real card scan is the end-to-end provider test.
- A home server is not provisioned by this release. It is an optional future NIM host and must be reachable through an authenticated HTTPS tunnel / private network, not an unauthenticated port-forward.
- NVIDIA Developer Program hosted endpoints are for prototyping, development, and testing under NVIDIA's current terms. NIM production use requires applicable NVIDIA AI Enterprise entitlement; the model itself may have separate license terms.

## v0.8 Local-first + Google Drive
- El inventario operativo permanece local (localStorage en la base heredada); fotografías originales permanecen en IndexedDB.
- Un escaneo no llama automáticamente a OpenAI, NVIDIA ni a la API de YGOPRODeck. La segunda opinión cloud requiere una acción explícita.
- Google Drive es respaldo complementario, no base transaccional. Se usa OAuth `drive.file` y carpeta visible `TCG_OP`.
- Cambios locales marcan el respaldo como pendiente. Si hay una sesión OAuth activa, se intenta sincronizar al recuperar conexión; tras recargar puede requerirse nueva autorización.
- Ver `DRIVE_SETUP_0.8.md` para configurar OAuth.
- Limitación heredada: Tesseract todavía se carga desde CDN y requiere conexión/caché para el primer uso; falta empaquetado local completo para OCR garantizado en modo avión.

## v0.8.1 — Dual Intelligence workflow foundation

- Tsuki technical review is represented by four independent gates: identification, classification, printing, and physical condition.
- Every gate requires a reviewer and evidence reference. Printing approval additionally requires an exact `printingId`.
- Yami market analysis is blocked until all four gates are approved (`TECHNICAL_APPROVED`).
- Reopening any technical gate revokes the aggregate approval and increments the technical revision.
- A market listing cannot publish until an owner approves a positive price and currency.
- Seller-facing data is generated through an explicit allowlist and excludes technical notes, owner notes, and raw market quotes.
- Sale registration changes the listing to `SOLD`; a sold listing cannot be sold again by the workflow contract.
- This release adds the tested workflow domain module only. It does not yet wire these rules into the PWA UI, persistent multi-user backend, remote QR access, or transactional cloud database.
- The existing local QR generator still embeds card details in its QR payload. Do not distribute those current QR codes to external sellers; replace them with revocable server-issued opaque tokens as part of the remote Sales Access implementation.
