# Privacy Policy — Feed Focus for YouTube

_Effective date: 2026-06-03_

Feed Focus for YouTube ("the extension") adds a small green / yellow / red marker
to each video tile on the YouTube home feed to indicate how attention-extractive
vs. restorative a video is likely to be. This policy explains exactly what data
the extension handles, why, and who receives it.

## What the extension processes

**Website content (video titles, channel names, durations).**
On youtube.com the extension reads the visible metadata of home-feed tiles
(title, channel name, and where shown duration / view count / upload time) and
sends these in small batches to an AI classifier so it can assign each tile a
color. No other page content, and no pages other than youtube.com, are read.

**Authentication information (your API key) — "bring your own key" mode only.**
If you choose to use your own AI provider key, that key is stored locally in your
browser (`chrome.storage.local`) and is sent only to the provider you selected, in
the `Authorization` header of classification requests. **Your key is never sent to
us, the developer, or to any third party.** You can remove it at any time in the
popup.

**Location (IP address) — "Free" mode only.**
In the optional shared **Free** mode, classification requests pass through our
rate-limited proxy. Like any web server, the proxy receives your IP address; it
uses it solely to enforce per-IP daily usage limits and stores only an anonymous
per-day request **count** for abuse prevention. These counters expire
automatically (about two days). We do not build profiles, and we do not link IPs
to identities.

## Who receives your data

- **Bring-your-own-key mode:** video titles/channels are sent directly from your
  browser to the AI provider **you** choose (e.g. Aliyun DashScope, Volcengine
  Ark, or any OpenAI-compatible endpoint you configure). Their handling of that
  data is governed by their own privacy policies.
- **Free mode:** video titles/channels are sent to our rate-limited proxy, which
  forwards them to Volcengine Ark for classification and returns the result.

## What we do NOT do

- We do **not** sell or rent your data.
- We do **not** use your data for advertising.
- We do **not** use your data for any purpose unrelated to producing the on-tile
  attention markers.
- We do **not** use your data to determine creditworthiness or for lending.
- We do **not** collect names, emails, passwords, financial information, health
  information, personal messages, browsing history, or your clicks/scrolls/keystrokes.
- There are no user accounts and no separate analytics server.

## Storage & retention

- Your settings and any API key live only in your browser’s
  `chrome.storage.local`.
- Video titles/channels are sent for classification and are not retained by us
  beyond what is needed to return a result; the Free-mode proxy keeps only
  anonymous daily counters (auto-expiring).

## Your choices

- Use **bring-your-own-key** mode to avoid the shared proxy entirely.
- Remove your API key, change provider, or turn the extension off at any time from
  the popup.
- Uninstalling the extension removes all locally stored settings.

## Changes

We may update this policy; material changes will be reflected by a new effective
date at the top.

## Contact

Questions or requests: https://github.com/luckiday/FeedFocus
