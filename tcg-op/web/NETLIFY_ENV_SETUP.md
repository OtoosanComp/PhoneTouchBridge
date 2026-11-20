# TCG OP 0.7 — Netlify environment setup

Open Netlify → Project configuration → Environment variables. Add these as **server-side variables** (never in `index.html`, `manifest.json`, or a `.env` committed to Git):

| Variable | Required now? | Value |
|---|---|---|
| `TCG_OP_ACCESS_TOKEN` | Yes | Random secret of at least 32 characters; this protects your private AI proxy |
| `OPENAI_API_KEY` | Yes for OpenAI vision | OpenAI API key from the API Platform; this is separate from a ChatGPT subscription |
| `OPENAI_VISION_MODEL` | Optional | `gpt-5.4-mini` (default) |
| `OPENAI_API_URL` | Optional | `https://api.openai.com/v1/chat/completions` |
| `AI_PROVIDER_PRIORITY` | Optional | `openai,home,nvidia` (default) |
| `HOME_AI_BASE_URL` | Later | Authenticated HTTPS URL of your home NIM gateway |
| `HOME_AI_CHAT_PATH` | Later | `/v1/chat/completions` |
| `HOME_AI_MODEL` | Later | Model name served by your home endpoint |
| `HOME_AI_API_KEY` | Later | Server-side bearer credential for your home gateway, if required |
| `NVIDIA_API_KEY` | Optional fallback | NVIDIA Build API key |
| `NVIDIA_VISION_MODEL` | Optional | `meta/llama-3.2-11b-vision-instruct` |
| `NVIDIA_API_URL` | Optional | `https://integrate.api.nvidia.com/v1/meta/llama-3.2-11b-vision-instruct` |

The default provider order is OpenAI first, then the home server, then NVIDIA. A provider is skipped if its credential or endpoint is not configured. Failed provider calls fall through to the next configured provider.

In the app, paste only the `TCG_OP_ACCESS_TOKEN` into **Card Intelligence · Conexión IA**. Do not paste the OpenAI or NVIDIA API key into the app. Those credentials remain in Netlify.

## Cost control for the $100 MXN test budget

- The default vision model is `gpt-5.4-mini`, selected for a cost/quality balance. Current published text rates are USD $0.75 / 1M input tokens and USD $4.50 / 1M output tokens; image tokens are billed as input and depend on image dimensions/detail. See the official pricing and vision documentation before changing models.
- Each request is limited to one image and 900 completion tokens. The function also rejects image payloads larger than its existing 5.5-million-character limit.
- These code limits reduce cost but **are not a hard monthly spending cap**. New prepaid API accounts currently have a $5 USD minimum credit purchase; after exchange rate, card fees and any applicable tax, that may be close to or above the $100 MXN test budget. The prepaid setup may enable auto-reload by default: turn it OFF before confirming. Prepaid balance is not an instantaneous spending cutoff, so do not treat it as a strict $100 MXN cap. If the checkout total exceeds your budget, do not purchase yet.
- The ChatGPT subscription does not pay for API calls. API billing is separate.

After adding or changing variables, trigger a new Netlify deploy so Functions receive them. In the app, run **Comprobar conexión**. The status panel confirms configured variables; the first real card scan is the end-to-end provider test.

## Personal-use warning

A public Netlify site with an AI proxy can be abused. Keep the site private while testing and do not share your `TCG_OP_ACCESS_TOKEN`. This shared-token gate is suitable for a private personal prototype, not a multi-user commercial authentication system.
