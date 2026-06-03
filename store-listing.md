# Chrome Web Store listing — draft copy

Paste these into the Developer Dashboard. Not shipped in the zip.

## Name
Feed Focus for YouTube

## Summary (≤132 chars)
Color cues on your YouTube home feed — green/yellow/red tile markers that flag
restorative vs. attention-extractive videos.

## Description
Feed Focus adds a small green / yellow / red marker to each YouTube home-feed
tile, estimating how *attention-extractive* vs. *restorative* a video is likely
to be — based on title, channel, duration and pacing signals, not just topic.

- Green = restorative or genuinely deep · Yellow = neutral · Red = high-stimulation / clickbait
- Offline rule hints work with no setup; an optional LLM classifier sharpens the call.
- Two ways to power the LLM: a rate-limited Free mode (no key), or bring your own
  key (Aliyun Qwen, Volcengine Doubao, or any OpenAI-compatible endpoint —
  OpenAI, DeepSeek, OpenRouter, Gemini, …).
- Choose marker style: corner dot, tile border, or dim the red tiles. Colorblind-safe letters.

This tool does not diagnose or treat anything. Tier labels are heuristic / model
opinions about pacing and clickbait patterns. Your viewing choices are your own.

## Category
Productivity

## Single purpose (required)
Display an at-a-glance attention/cognitive-load cue (a colored marker) on each
YouTube home-feed video tile.

## Permission justifications
- **storage** — Save the user's settings and (in BYOK mode) their API key locally
  in the browser.
- **host: www.youtube.com** — The content script reads visible tile metadata
  (title, channel, duration) and draws the markers on the page.
- **host: dashscope.aliyuncs.com, ark.cn-beijing.volces.com** — Send batched
  video titles/channels to the user-selected LLM classifier (BYOK).
- **host: *.workers.dev** — Free mode routes batches through our rate-limited
  proxy, which holds the shared key server-side.
- **optional_host_permissions (https://*/*)** — Requested on demand ONLY when a
  user configures their own custom OpenAI-compatible endpoint, so the extension
  can reach the host they typed. Never requested otherwise.

## Data usage disclosures
- Collected: video titles + channel names from the YouTube page; the user's API
  key (stored locally only).
- Used solely to classify tiles for the marker feature.
- Sent to: the LLM provider the user selected (or our proxy in Free mode).
- NOT sold, NOT used for advertising, NOT used for unrelated purposes.
- No separate analytics server.

## Privacy policy (host this and paste the URL)
> Feed Focus for YouTube processes the titles and channel names of videos shown
> on your YouTube home feed to assign an attention-cue color. In "Your own key"
> mode these are sent directly to the AI provider you choose; in "Free" mode they
> are sent to our rate-limited proxy, which forwards them to the AI provider and
> retains only anonymous daily request counts for abuse prevention. Your settings
> and any API key are stored locally in your browser (chrome.storage.local) and
> are never transmitted to us. We do not sell data or use it for advertising.
> Contact: github.com/luckiday

(Publish on GitHub Pages, a gist, Notion public page, etc. Chrome requires a
reachable privacy-policy URL because the extension handles an API key + page data.)
