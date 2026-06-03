# Feed Focus for YouTube

A Manifest V3 Chrome extension that adds a **small green / yellow / red dot** to each
**youtube.com** home‑feed tile, flagging how *restorative* vs. *attention‑extractive*
a video is likely to be. Colors come from an **LLM classifier** plus **offline gray
hints** from lightweight rules.

- **Green** — restorative / genuinely deep · **Yellow** — neutral · **Red** — high‑stimulation / clickbait
- Two ways to power the classifier: a rate‑limited **Free mode** (no key) or **bring your own key** (Aliyun Qwen, Volcengine Doubao, or any OpenAI‑compatible provider).
- **No API key is ever bundled into the build.**

**Naming:** “Feed Focus” reads clearly in the store and avoids implying a medical or
neuroscience measurement — it’s a **personal attention cue**, not clinical advice.

## Quickstart

```bash
npm install
npm run build          # bundles src/ → popup/ background/ content/ (no secrets)
```

Then load it: **`chrome://extensions`** → enable **Developer mode** → **Load unpacked**
→ select this directory (where `manifest.json` lives). Open the toolbar popup to pick a
mode (see below) and start browsing youtube.com.

## Disclaimer

This tool does **not** diagnose or treat anything. Tier labels are **heuristic / model
opinions** about pacing and clickbait patterns. Your viewing choices are yours alone.

## Access modes

The popup’s **Access** toggle chooses where classification runs (no secret is baked into
the build either way):

- **Free (shared)** — routes batches through a rate‑limited **Cloudflare Worker**
  ([`proxy/`](proxy/README.md)) that holds *your* Volcengine Ark key server‑side and caps
  usage per device / IP / globally. New users get value with **no key**. Requires
  deploying the proxy and setting `PROXY_BASE_URL` in `src/shared/config.ts`.
- **Your own key (BYOK)** — the user pastes their own key; the background worker calls the
  provider directly.

### Configure BYOK

1. Switch **Access** to *Your own key*.
2. Choose a **Provider**:
   - **Aliyun Qwen (DashScope)** — paste your `sk-…` key ([get one](https://bailian.console.aliyun.com/?apiKey=1)).
   - **Volcengine Doubao (Ark)** — paste your Ark key.
   - **Other — OpenAI‑compatible** — any provider exposing a standard `/chat/completions`
     endpoint. Quick‑fill buttons for **OpenAI / DeepSeek / OpenRouter / Google Gemini**,
     or type any **Base URL** (e.g. Groq, Moonshot/Kimi, Zhipu GLM, Anthropic’s
     OpenAI‑compat endpoint, local Ollama).
3. Enter the matching **Model id**, hit **Test key**, then **Save**.

> The Base URL is the part *before* `/chat/completions` (e.g. `https://api.openai.com/v1`).
> For a custom provider Chrome prompts once to allow that host (granted on Test/Save via
> `optional_host_permissions`).

Keys are stored in `chrome.storage.local` and read at request time. With neither mode
available, tiles show gray rule‑based hints only.

## User‑visible behavior

Markers sit at the **bottom‑right of each tile, below the thumbnail** (off the picture, so
they don’t compete with the video for attention):

1. **Hollow gray ring** — waiting on the model.
2. **Gray dot** — rules ran; no reliable LLM tier (or no key).
3. **Solid green / yellow / red dot** — from the model (or cached output). Color is the
   signal; the **G/Y/R letter is optional** (off by default, toggle in the popup for
   colorblind‑safe reading).

The popup also offers a master **on/off** switch, a **color legend**, **marker style**
(*corner dot* / *tile border* / *dim red*), **max batch size**, and optional **console
logging**. Changing any setting re‑renders the open YouTube tab instantly (reusing cached
tiers — no extra API calls).

## Privacy & data

- **youtube.com only:** the content script reads visible tile metadata (title, channel,
  duration) and draws markers locally.
- **storage:** settings and any API key live in `chrome.storage.local`; the key never
  leaves your browser except in requests to the provider you chose.
- **network:** titles/channels are batched to the selected provider (BYOK) or to the Free
  proxy, which forwards them to Volcengine Ark and keeps only anonymous daily counts for
  rate limiting. No analytics server.

Draft Web Store **single‑purpose**, **permission justification**, and **privacy** copy is
in [`store-listing.md`](store-listing.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | Bundle `src/` → `popup/ background/ content/`. No secrets embedded. |
| `npm run watch` | Rebuild on change. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run icons` | Regenerate `icons/icon{16,32,48,128}.png` — from `icons/icon.png` if present (via `sips`), else on‑brand placeholders. |
| `npm run zip` | Build, then package **only** the shipped files into `feed-focus-for-youtube-v<version>.zip`. |

## Chrome Web Store

`npm run zip` produces an upload‑ready archive containing exactly `manifest.json`,
`background/`, `content/`, `popup/`, and `icons/` — and nothing else (no `src/`, `proxy/`,
`.env`, `node_modules/`, `.git/`). **Never** put an API key in the uploaded zip; keys are
user‑supplied via the popup.

Upload at <https://chrome.google.com/webstore/devconsole> and fill the listing from
[`store-listing.md`](store-listing.md).

## Layout

```text
./
├── manifest.json
├── esbuild.config.mjs      # bundles src/ — no secrets injected
├── popup/                  # built UI (html/css + bundled js)
├── background/             # built service worker
├── content/               # built content script + css
├── icons/                 # icon16/32/48/128 (+ optional icon.png master)
├── src/                    # TypeScript sources
├── scripts/                # make-icons.mjs, zip.mjs
├── proxy/                  # Cloudflare Worker for Free mode (deployed separately)
└── store-listing.md        # Web Store copy + permission/privacy drafts
```

> `proxy/` is a separate Cloudflare deploy — it is **not** shipped inside the Chrome zip.
