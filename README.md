# Feed Focus for YouTube

Unpacked Chrome extension (MV3) that adds **small green / yellow / red markers** on **youtube.com** home‑feed tiles. Colors reflect an optional **LLM classifier** (**bring your own API key**, entered in the popup) plus **offline gray hints** from lightweight rules.

**Naming:** “Feed Focus” reads clearly in the store and avoids implying a medical or neuroscience measurement—it’s a **personal attention cue**, not clinical advice.

## Disclaimer

This tool does **not** diagnose or treat anything. Tier labels are **heuristic / model opinions** about pacing and clickbait patterns. Your viewing choices are yours alone.

## Privacy & data

- **youtube.com only:** Content script runs on YouTube; markers are drawn locally.
- **storage:** Settings (model id, **your API key**, batch size, verbose logging) live in `chrome.storage.local`. The key never leaves your browser except in requests to the provider you chose.
- **network:** When you enter a key in the popup, the background worker calls **Aliyun DashScope** (and/or **Volcengine Ark** for Doubao models) OpenAI‑compatible `chat/completions` endpoints with **batched video titles/channels** (see source). No keys are bundled into the shipped extension; no separate analytics server is included.

Prepare matching **single‑purpose** and **permission justification** text for the Chrome Web Store listing from the above.

## Build

```bash
npm install
npm run build
```

Load **`chrome://extensions`** → **Load unpacked** → select **this directory** (where `manifest.json` lives).

- **`npm run build`** — bundles `src/` into `popup/`, `background/`, `content/`. **No secrets are embedded.**

### Access modes

The popup offers two modes (no secret is ever baked into the build):

- **Free (shared)** — routes batches through a rate-limited Cloudflare Worker that holds *your* Volcengine Ark key server-side (Doubao model). New users get value with **no key**. Requires deploying the proxy in [`proxy/`](proxy/README.md) and setting `PROXY_BASE_URL` in `src/shared/config.ts`. This is the hard-budget-capped free tier for early users.
- **Your own key (BYOK)** — the user pastes their own key in the popup; the background worker calls the provider directly. Higher limits and Qwen models.

To configure BYOK in the popup:

1. Switch **Access** to *Your own key*.
2. Choose a **Provider**:
   - **Aliyun Qwen (DashScope)** — paste your `sk-…` key ([get one](https://bailian.console.aliyun.com/?apiKey=1)).
   - **Volcengine Doubao (Ark)** — paste your Ark key.
   - **Other — OpenAI-compatible** — works with any provider exposing a standard `/chat/completions` endpoint. Quick-fill buttons for **OpenAI / DeepSeek / OpenRouter / Google Gemini**, or type any **Base URL** (e.g. Groq, Moonshot/Kimi, Zhipu GLM, Anthropic's OpenAI-compat endpoint, local Ollama).
3. Enter the matching **Model id**.
4. Hit **Test key**, then **Save**.

> The Base URL is the part *before* `/chat/completions` (e.g. `https://api.openai.com/v1`).
> For a custom provider, Chrome prompts once to allow access to that host (granted on Test/Save via `optional_host_permissions`).

Keys are stored in `chrome.storage.local` and read at request time. With neither mode available, tiles show gray rule-based hints only.

## User‑visible behavior

Markers sit at the **bottom‑right of each tile, below the thumbnail** (off the picture, so they don't compete with the video for attention):

1. **Hollow gray ring** — Waiting on the model.
2. **Gray dot** — Rules ran; no reliable LLM tier (or no API key).
3. **Solid green / yellow / red dot** — From the model (or cached output). Color is the signal; the G/Y/R **letter is optional** (off by default, toggle in the popup for colorblind‑safe reading).

Open the toolbar popup to configure:

- **On/off switch** (header) — master toggle; off removes all markers.
- **Color legend** — what G / Y / R / gray mean.
- **API keys** with a **Test key** button that validates the key live against the selected model's provider.
- **Marker style** — *Corner dot* (subtle), *Tile border* (colored outline), or *Dim red* (fades R tiles, reveal on hover).
- **G/Y/R letters** toggle (colorblind‑safe), **model preset**, **max batch size**, and optional **console logging**.

Changing settings re‑renders the open YouTube tab instantly (reusing cached tiers, no extra API calls).

## Chrome Web Store zip

Zip **only** what ships:

- `manifest.json`, `background/`, `content/`, `popup/`

Exclude `src/`, `node_modules/`, `.env`, `.git/`, and dev configs unless Google requests source. **Never** put an API key in the uploaded zip — keys are user-supplied via the popup.

## Layout

```text
./
├── manifest.json
├── esbuild.config.mjs      # bundles src/ — no secrets injected
├── popup/                   # built UI
├── background/
├── content/
├── src/                     # TypeScript sources
└── proxy/                   # Cloudflare Worker for Free mode (deployed separately)
```

> Don't ship `proxy/` inside the Chrome zip — it's a separate Cloudflare deploy.
