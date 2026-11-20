# TCG OP 0.7 — OpenAI-first Card Intelligence

## Changes
- Added an OpenAI vision adapter using the Chat Completions API.
- Default model: `gpt-5.4-mini`; configurable through `OPENAI_VISION_MODEL`.
- Sends a single card image with `detail: high` and OCR text context.
- Requests strict JSON Schema output for candidate fields, keeping card name, set code, and collector number separate.
- Provider priority now defaults to `openai,home,nvidia`; home and NVIDIA adapters remain available as fallbacks.
- AI status endpoint reports OpenAI configuration and model status.
- Updated the connection panel copy and Netlify setup guide.
- Preserved the existing access-token gate, local OCR/catalog workflow, confidence logic, Tsuki/Yami shared-engine roles, and market-price separation.

## Security and cost
- `OPENAI_API_KEY` is read only by the Netlify Function and must never be placed in the PWA/APK.
- The endpoint still requires `TCG_OP_ACCESS_TOKEN`.
- One image per request, 900 maximum completion tokens, and existing image-size validation.
- These are request-level controls, not a hard monthly budget cap. Configure usage controls in the OpenAI API Platform and monitor spend.

## Deployment
See `NETLIFY_ENV_SETUP.md`. Required server variables: `TCG_OP_ACCESS_TOKEN` and `OPENAI_API_KEY`.
