# TCG OP 0.6 — Hybrid AI & Home Server Edition

## Included
- NVIDIA NIM hosted vision adapter using the documented Llama 3.2 11B Vision model endpoint and image data URI content parts.
- Optional home NIM endpoint using OpenAI-compatible `/v1/chat/completions`.
- Provider order with home-first / NVIDIA fallback.
- Netlify AI status endpoint.
- Server-side secrets only; PWA never receives NVIDIA API key.
- Personal shared-token gate for the AI proxy.
- UI to store the personal TCG OP access token on the device and check server configuration.
- PWA manifest and service worker updated for 0.6.
- Automated test suite: 30 tests passing.
- Home-server deployment and security plan.

## Deployment
1. Export the current inventory JSON before replacing files.
2. Deploy the complete contents of this folder to the same Netlify site / domain.
3. Add `TCG_OP_ACCESS_TOKEN` and `NVIDIA_API_KEY` in Netlify environment variables; optionally set the model and endpoint variables described in `NETLIFY_ENV_SETUP.md`.
4. Redeploy so Netlify Functions receive the variables.
5. Open the app, enter only the `TCG_OP_ACCESS_TOKEN` in the AI connection panel, save it, and check status.
6. Use PWABuilder against the deployed HTTPS site to package Android. The same manifest and service worker are included.

## Home server
The adapter is ready for an authenticated HTTPS home NIM gateway. A physical server is not provisioned by this ZIP. See `home-server/README.md` for the future deployment plan.

## Boundaries
- Cloud vision works only after the user configures a valid NVIDIA API key and access token.
- Developer Program API access is for prototyping / development / testing under NVIDIA's terms. Production NIM requires the applicable NVIDIA AI Enterprise license; each model also has its own license.
- The Home AI server needs supported NVIDIA GPU hardware, a compatible model/container and secure remote access. Do not expose an unauthenticated inference port.
- This release does not claim automatic model-weight training. Learning memory remains human-confirmed and local.
- Catalog matching and human confirmation remain authoritative; VLM output is a candidate, not a fact.
