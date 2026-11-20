# TCG OP Home AI Server — deployment plan

The 0.6 PWA is already compatible with an OpenAI-style vision endpoint. This folder documents the future home-server role; it does not pretend that a physical GPU server has been provisioned.

## Architecture

- PWA / Android stays local-first: IndexedDB, card catalog, OCR, inventory, learning memory.
- Netlify Functions are the only public gateway. They keep NVIDIA credentials server-side and can route to a home endpoint first, then NVIDIA Cloud.
- Home NIM endpoint must implement `POST /v1/chat/completions` with image_url data-URI support.
- The app does not connect directly to a private LAN address. For remote access, use a private overlay network or an authenticated HTTPS tunnel (for example, Tailscale Serve or Cloudflare Tunnel with access controls). Do not port-forward an unauthenticated inference port to the public internet.

## Hardware selection is deliberately postponed

Do not buy a GPU based only on disk capacity. Model compatibility and usable VRAM are the limiting factors; system RAM, PSU, cooling, storage throughput and GPU support matter too. Choose the target model first, then check its current NIM model card / hardware requirements and the license for that exact model. A 11B vision model is the initial cloud evaluation target, not a promise that it will fit every consumer GPU.

## NVIDIA NIM licensing

NVIDIA's current documentation says NVIDIA Developer Program access is for prototyping, research, development and testing. Production use of NIM requires an NVIDIA AI Enterprise entitlement; model weights may also have separate model licenses. Confirm current terms before using NIM for real end-user production. A 90-day AI Enterprise evaluation is available from NVIDIA, subject to its terms.

## When hardware is acquired

1. Install a supported Linux distribution and NVIDIA driver for the selected GPU.
2. Select a downloadable vision NIM model in NVIDIA Build / NGC and check its current GPU/VRAM requirements and license.
3. Follow that model's exact NGC container instructions. Do not guess a container tag or VRAM requirement.
4. Bind the inference service to a private interface; enable HTTPS and authentication at the reverse proxy / private tunnel.
5. Test `POST /v1/chat/completions` with one image data URI and confirm JSON output matches the TCG OP candidate schema.
6. Set Netlify environment variables `HOME_AI_BASE_URL`, `HOME_AI_CHAT_PATH=/v1/chat/completions`, `HOME_AI_MODEL`, and optionally `HOME_AI_API_KEY` (if the reverse proxy expects a bearer key).
7. Keep `AI_PROVIDER_PRIORITY=home,nvidia` so NVIDIA Cloud can be the fallback when its API key is configured.

## Important

The home server is an optional accelerator. If it is powered off or unreachable, TCG OP continues to use local OCR/catalogs and, when configured, NVIDIA Cloud. Never put NGC or NVIDIA API keys in the PWA, APK, Git repository, or this folder.
