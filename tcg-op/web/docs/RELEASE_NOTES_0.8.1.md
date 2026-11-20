# TCG OP 0.8.1 — Dual Intelligence Foundation

## Decisions formalized
- Tsuki owns four mandatory technical gates: identification, classification, printing, and condition.
- All four gates must be approved before Yami can begin market analysis.
- Yami owns global market research and commercial valuation; owner approval is required before publication.
- Seller-facing output is restricted to an explicit commercial allowlist.
- Sale registration is one-way in the workflow contract and blocks a second sale of the same listing.

## Implementation
- Added `src/card-intelligence/dual-workflow.js` with framework-independent workflow rules.
- Added `tests/dual-workflow.test.mjs` with nine acceptance tests.
- Preserved the existing local-first app, card recognition engine, catalog adapters, OCR, AI provider configuration, inventory, and backup behavior.

## Verification
- Existing baseline: 40 tests passing.
- Dual workflow tests: 9 passing.
- Combined suite: 49 passing, 0 failing.

## Not yet enabled
- PWA screens for Tsuki and Yami.
- Persistent technical review records in inventory storage.
- Global multi-source market quote adapters and FX audit records.
- Cloud authentication, seller accounts, server-issued QR tokens, and atomic remote sale transactions.

## Security warning
The current 0.8 local QR generator encodes card details in the QR payload. It is not the approved Sales Access QR design and must not be distributed to external sellers. The remote sales feature must use revocable opaque tokens and a server-side allowlisted response.
