# Feed Focus for YouTube

Unpacked Chrome extension (MV3) that adds **small green / yellow / red markers** on **youtube.com** home‑feed tiles. Colors reflect an optional **LLM classifier** (your keys, injected at build time) plus **offline gray hints** from lightweight rules.

**Naming:** “Feed Focus” reads clearly in the store and avoids implying a medical or neuroscience measurement—it’s a **personal attention cue**, not clinical advice.

## Disclaimer

This tool does **not** diagnose or treat anything. Tier labels are **heuristic / model opinions** about pacing and clickbait patterns. Your viewing choices are yours alone.

## Privacy & data

- **youtube.com only:** Content script runs on YouTube; markers are drawn locally.
- **storage:** Settings (model id, batch size, verbose logging) live in `chrome.storage.local`.
- **network:** With keys configured at build, the background worker calls **Volcengine Ark** and/or **Aliyun DashScope** OpenAI‑compatible `chat/completions` endpoints with **batched video titles/channels** (see source). No separate analytics server is included.

Prepare matching **single‑purpose** and **permission justification** text for the Chrome Web Store listing from the above.

## Build

```bash
npm install
cp .env.example .env   # then edit .env — never commit .env
npm run build
```

Load **`chrome://extensions`** → **Load unpacked** → select **this directory** (where `manifest.json` lives).

- **`npm run build`** — reads `.env` next to `manifest.json` and inlines API keys into the background bundle.
- **`npm run build:public`** — same bundles with **empty** keys (safe before `git push`).

Supported `.env` variables for keys (see `.env.example`): `DASHSCOPE_API_KEY`, `ARK_API_KEY` / `VOLCENGINE_API_KEY`. Optional merge into storage on install: `MODEL_ID`, `BATCH_MAX`, `VERBOSE_LOGGING`.

## User‑visible behavior

1. **Gray dot** — Rules ran; no reliable LLM tier yet (or LLM unavailable).
2. **Hollow ring** — Waiting on the model.
3. **Solid G / Y / R** — From the model (or cached model output).

Open the toolbar popup to choose **model preset**, **max batch size**, and optional **console logging**.

## Chrome Web Store zip

Zip **only** what ships:

- `manifest.json`, `background/`, `content/`, `popup/`
- Optional packaged `.env` **only** if you intentionally ship defaults (avoid putting secrets in the uploaded zip).

Exclude `src/`, `node_modules/`, `.env` with real keys, and dev configs unless Google requests source.

## Layout

```text
./
├── manifest.json
├── .env.example
├── esbuild.config.mjs      # defines keys from .env at bundle time
├── popup/                   # built UI
├── background/
├── content/
└── src/                     # TypeScript sources
```
