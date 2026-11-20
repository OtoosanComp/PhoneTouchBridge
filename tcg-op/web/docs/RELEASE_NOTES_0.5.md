# TCG OP 0.5 — Card Intelligence Foundation

## Included
- Full local catalog download for Riftbound (RiftHunt bulk cards + finish-specific price data).
- Full Yu-Gi-Oh! catalog download from YGOPRODeck v7, refreshed only when its database version changes.
- IndexedDB storage for catalog printings, sync metadata and confirmed learning examples.
- Exact printing ID joins for Riftbound prices; avoids the non-unique Riot ID trap.
- Separate finish-specific prices (normal / foil).
- USD/MXN refresh and conservative median/outlier filtering.
- Explicit low-confidence label when there are not enough comparable sources for a market average.
- Tsuki and Yami role routing inside one shared engine.
- Learning memory only after the user saves a confirmed card.
- Catalog status panel and browser storage estimate.
- Existing inventory localStorage key and card-photo IndexedDB database remain unchanged.

## Deploy
1. Export a JSON backup from the current app before updating.
2. Unzip this release.
3. Upload the contents of `TCG_OP_PWA_0.5_CARD_INTELLIGENCE` to the same Netlify site/domain.
4. Open the site while online.
5. Go to **Biblioteca Card Intelligence** and press **Descargar / actualizar catálogos**.
6. Keep the app open until both catalog downloads complete.
7. Test one Riftbound card and one Yu-Gi-Oh! card.

## Important limits
- This is a catalog + pricing + learning foundation, not a completed autonomous vision model.
- Cloud vision is still not configured.
- RiftHunt's Riftbound market feed currently gives TCGplayer prices by printing/finish. Until additional comparable marketplaces are integrated, the UI labels a single source as indicative, not a fair-market average.
- YGOPRODeck's `set_price` is an indicative set reference, not a verified Mexican sold-price average.
- USD prices require the stored USD/MXN rate. If FX lookup fails, no converted MXN quote is displayed.
- Riftbound art is not bulk-downloaded; Riot's digital-tools policy still applies.
