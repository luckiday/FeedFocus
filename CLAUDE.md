# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Feed Focus for YouTube" — a Chrome MV3 extension that puts a green/yellow/red marker on each youtube.com feed tile, rating how restorative vs. attention-extractive the video looks. Tiers come from an LLM; offline keyword rules only provide a gray fallback hint. `proxy/` is a separate Cloudflare Worker that powers the no-key "Free" mode and is **not** shipped in the extension.

## Commands

```bash
npm install
npm run build       # esbuild: src/ → popup/popup.js, background/background.js, content/youtube-home.js
npm run watch       # rebuild on change
npm run typecheck   # tsc --noEmit
npm test            # = typecheck + build (there are no unit tests)
npm run zip         # build, then package only manifest.json + background/ content/ popup/ icons/ for the Web Store
npm run icons       # regenerate icons/icon{16,32,48,128}.png
```

To try changes: `npm run build`, then reload the unpacked extension at `chrome://extensions` (the repo root is the extension root) and refresh the YouTube tab.

Proxy (from `proxy/`): `wrangler deploy`; the Ark key is a secret set via `wrangler secret put ARK_API_KEY`; caps and model live in `[vars]` in `proxy/wrangler.toml`.

## Build output is committed

The `.js` bundles in `popup/`, `background/`, `content/` are generated but tracked in git. Edit `src/**/*.ts`, never the bundles, and rebuild so they stay in sync before committing. `popup/popup.html`, `popup/popup.css`, and `content/youtube-home.css` are hand-written (not generated).

## Architecture

Three bundles talk through `chrome.storage.local` and runtime messaging; shared types/constants live in `src/shared/`.

**Content script** (`src/content/`, runs on youtube.com):
- `youtube-home.ts` — entry. A `MutationObserver` + YouTube SPA events (`yt-navigate-finish`, `yt-page-data-updated`) trigger a debounced scan. Each new tile gets a pending marker, a heuristic tier stored in `dataset` (tooltip/log only, never the dot color), and is enqueued for the LLM. A `chrome.storage.onChanged` listener on the settings key clears and repaints everything, so popup changes apply live and reuse cached tiers.
- `yt-dom.ts` — all YouTube DOM selectors (tile discovery, title/channel/duration/views/handle/Shorts extraction, stable item id). YouTube markup changes break things here first.
- `llm-batch.ts` — batching queue: dedupes by item id, checks the persistent tier cache first, flushes at `batchMax` or after `FLUSH_MS` idle, with at most `MAX_CONCURRENT_FLUSHES` in flight. Opens a long-lived port (`PORT_CLASSIFY_STREAM`) to the background and paints partial results as they stream in; failed or missing ids fall back to a gray heuristic marker. It also maps error strings (`global_cap`, `rate_limited`, `no_api_key`, `http_4xx`…) to console hints.
- `markers.ts` — `paintMarker` renders pending / heuristic / tier states for the three marker styles (dot/border/dim) through `data-ff-*` attributes styled in `content/youtube-home.css`.

**Background service worker** (`src/background/`):
- `background.ts` routes by `settings.keyMode`: `"free"` → `proxy-classify.ts` (POST `${PROXY_BASE_URL}/classify` with an `X-Device-Id` header, non-streaming, sends one `final` message); `"own"` → `ark-classify.ts` (streaming OpenAI-compatible `/chat/completions` against the resolved provider, sends incremental `partial` messages and then `final`). It also handles the `TEST_KEY` one-shot message from the popup.
- `ark-classify.ts` holds the classifier `SYSTEM_PROMPT`, the SSE parsing, and tolerant JSON-array extraction (it pulls complete `{"id","v"}` objects out of partial text).
- `env-bootstrap.ts` runs on install/update to rewrite migrated model ids.

**Popup** (`src/popup/popup.ts`): settings UI. For custom OpenAI-compatible base URLs it requests `optional_host_permissions` at runtime; fixed provider hosts are in `manifest.json` `host_permissions`.

**Shared** (`src/shared/`):
- `settings.ts` — `FeedFocusSettings`, `DEFAULT_SETTINGS`, `hydrateSettings` (always read settings through this; it coerces types and migrates old values), `resolveProvider` (dashscope / ark / openai → key + base URL), model presets, and `MODEL_ID_MIGRATIONS`. When renaming a model preset, add an old→new entry there.
- `messages.ts` — the wire protocol between content, background, and proxy. Items use compact keys (`id,t,c,d,vc,pub,h,short`) and results are `{id, v: "G"|"Y"|"R"}`.
- `tier-cache.ts` — persistent LRU-ish cache (2000 entries) of LLM tiers keyed by item id, in `chrome.storage.local`.
- `config.ts` — `PROXY_BASE_URL` (the deployed worker URL; not a secret).

## Things to keep in sync

- The classifier system prompt exists in two places: `src/background/ark-classify.ts` (full version with few-shot examples) and `proxy/worker.js` (condensed). The output contract (JSON array of `{"id","v"}`) must match in both.
- The item/result shape in `messages.ts` must match what `proxy/worker.js` sanitizes and returns.
- The proxy's `MAX_ITEMS` should be ≥ the batch size the extension sends in Free mode (popup allows 1–50).
- No API key may be bundled into the build or the zip. Keys are user-entered and stored in `chrome.storage.local`; the proxy key exists only as a Wrangler secret. `.env` is not read by the build.
- `manifest.json` `description` must stay ≤132 chars (Web Store limit). `store-listing.md` and `PRIVACY.md` hold the Web Store copy and permission justifications, so update them when permissions or data flows change.
