<p align="center">
  <img src="icons/icon128.png" width="96" alt="Feed Focus for YouTube logo" />
</p>

<h1 align="center">Feed Focus for YouTube 👋</h1>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/feed-focus-for-youtube/pmhljfmfkgdgaicpgacdaddglnlidabo">
    <img alt="Chrome Web Store version" src="https://img.shields.io/chrome-web-store/v/pmhljfmfkgdgaicpgacdaddglnlidabo?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=4285F4" />
  </a>
  <a href="https://chromewebstore.google.com/detail/feed-focus-for-youtube/pmhljfmfkgdgaicpgacdaddglnlidabo">
    <img alt="Chrome Web Store users" src="https://img.shields.io/chrome-web-store/users/pmhljfmfkgdgaicpgacdaddglnlidabo?color=34A853" />
  </a>
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-blue" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <a href="PRIVACY.md">
    <img alt="Privacy" src="https://img.shields.io/badge/privacy-no%20analytics-brightgreen" />
  </a>
</p>

> A Chrome extension that puts a small 🟢 / 🟡 / 🔴 dot on every YouTube feed tile, showing whether a video looks **restorative** or **attention‑extractive** *before* you click.

### 🏠 [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/feed-focus-for-youtube/pmhljfmfkgdgaicpgacdaddglnlidabo)

---

## ✨ Features

- 🟢 **Green**: restorative or genuinely deep (lectures, tutorials, slow vlogs, long calm interviews)
- 🟡 **Yellow**: neutral, standard entertainment (reviews, playthroughs, casual vlogs)
- 🔴 **Red**: high stimulation or clickbait (outrage hooks, hype, drama, most Shorts)
- ⚪ **Gray**: offline rule‑based hint when no model result is available
- 🆓 **Free mode** works with **no API key**, through a rate‑limited shared proxy
- 🔑 **Bring your own key**: Aliyun Qwen, Volcengine Doubao, or any OpenAI‑compatible API (OpenAI, DeepSeek, OpenRouter, Gemini, Groq, Ollama, …)
- 🎨 Marker styles: *corner dot*, *tile border*, or *dim red tiles*, plus optional G/Y/R letters for colorblind readers
- ⚡ Batched, streaming classification with a local cache, so tiles you've already seen cost no extra API calls
- 🔒 No bundled keys, no analytics, and it only runs on youtube.com

The classifier judges **format, not topic**. *"How Bridges Actually Work"* from Practical Engineering gets green, while *"This Bridge Collapse Will SHOCK You 😱"* gets red.

> **Disclaimer:** Feed Focus is a personal attention cue. It does not diagnose or treat anything, and tiers are heuristic or model opinions.

## 🚀 Usage

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/feed-focus-for-youtube/pmhljfmfkgdgaicpgacdaddglnlidabo).
2. Open **youtube.com** and markers appear under each tile's thumbnail:
   - hollow gray ring: waiting for the model
   - solid gray dot: rules only, no model tier
   - solid green / yellow / red: model result
3. Click the toolbar icon to switch it on or off, change marker style, or pick an **Access** mode.

### Access modes

| Mode | Key needed | How it works |
|---|---|---|
| **Free (shared)** | No | Batches go to a rate‑limited Cloudflare Worker ([`proxy/`](proxy/README.md)), which calls Volcengine Ark. Daily caps apply. |
| **Your own key** | Yes | The extension calls your chosen provider directly. The key stays in `chrome.storage.local`. |

**Setting up your own key:** set *Access* to **Your own key**, pick a **Provider**, paste the key, enter a **Model id**, then click **Test key** and **Save**.
For *Other (OpenAI‑compatible)*, the **Base URL** is the part before `/chat/completions` (e.g. `https://api.openai.com/v1`). Chrome asks once for permission to reach that host.

## 🛠️ Development

**Prerequisites:** Node.js 18+ and Chrome

```sh
git clone https://github.com/luckiday/FeedFocus.git
cd FeedFocus
npm install
npm run build
```

Load it in Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the repo root (the folder with `manifest.json`).

| Command | What it does |
|---|---|
| `npm run build` | Bundle `src/` into `popup/`, `background/`, and `content/` |
| `npm run watch` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Typecheck and build |
| `npm run icons` | Regenerate `icons/icon{16,32,48,128}.png` |
| `npm run zip` | Build, then package only the shipped files for the Web Store |

### How it works

```text
YouTube tab (content script)          Background service worker            LLM
┌───────────────────────────┐  port   ┌──────────────────────────┐
│ scan tiles → rule hint     │ ──────► │ Free → proxy/ (Worker)   │ ──► Volcengine Ark
│ cache hit? paint : enqueue │ ◄────── │ Own key → provider API   │ ──► Qwen / Doubao / OpenAI‑compat
│ batch & stream → paint dot │ partial └──────────────────────────┘
└───────────────────────────┘
```

### Project layout

```text
├── manifest.json
├── src/
│   ├── content/      # tile scanning, YouTube DOM selectors, batching queue, markers
│   ├── background/   # provider + proxy clients, streaming parser, system prompt
│   ├── popup/        # settings UI
│   └── shared/       # settings, message types, tier cache, config
├── popup/ background/ content/   # built output loaded by Chrome
├── proxy/            # Cloudflare Worker for Free mode (deployed separately)
├── scripts/          # icon + zip helpers
├── PRIVACY.md
└── store-listing.md
```

### Self‑hosting Free mode

Deploy your own Worker by following [`proxy/README.md`](proxy/README.md), set `PROXY_BASE_URL` in [`src/shared/config.ts`](src/shared/config.ts), and rebuild.

## 🔒 Privacy

- Reads only visible tile metadata on youtube.com: title, channel, duration, views, and upload time.
- Sends that metadata only to the provider you choose, or to the Free proxy, which keeps anonymous daily counts for rate limiting.
- Your API key never leaves your browser except in requests to your chosen provider.

Full policy: [PRIVACY.md](PRIVACY.md)

## 👤 Author

**luckiday**

- GitHub: [@luckiday](https://github.com/luckiday)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/luckiday/FeedFocus/issues).

## ⭐️ Show your support

If this helps you take back your feed, give the repo a ⭐️ or leave a review on the [Chrome Web Store](https://chromewebstore.google.com/detail/feed-focus-for-youtube/pmhljfmfkgdgaicpgacdaddglnlidabo)!
