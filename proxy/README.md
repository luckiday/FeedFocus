# Feed Focus — free-tier proxy

A tiny Cloudflare Worker that powers the extension's **Free mode**. It holds your
Volcengine **Ark** API key server-side and rate-limits usage, so the key is never
shipped in the extension and your free tokens can't be drained.

```
extension (Free mode) ──► <your-worker>.workers.dev/classify ──► Volcengine Ark
                          key lives only here · per-device/IP/global daily caps
```

Users on Free mode need no key. Power users switch to **Your own key** (BYOK) in
the popup for higher limits / better models (Qwen via DashScope).

## Deploy (5 steps)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd proxy
npm i -g wrangler            # or use `npx wrangler ...` below
wrangler login              # opens browser

# 1. Create the KV namespace, then paste the printed id into wrangler.toml
wrangler kv namespace create FEED_FOCUS_KV

# 2. Store your Volcengine Ark key as a secret (NOT in any file)
wrangler secret put ARK_API_KEY     # paste a freshly-created Ark key

# 3. Deploy
wrangler deploy
```

`wrangler deploy` prints your URL, e.g. `https://feed-focus-proxy.<you>.workers.dev`.

## Point the extension at it

In `../src/shared/config.ts` set:

```ts
export const PROXY_BASE_URL = "https://feed-focus-proxy.<you>.workers.dev";
```

Then rebuild the extension (`cd .. && npm run build`) and reload it.

## Tuning the caps

Edit `[vars]` in `wrangler.toml` and re-run `wrangler deploy`:

| var | meaning | default |
|---|---|---|
| `DEVICE_DAILY_LIMIT` | videos/day per install | 200 |
| `IP_DAILY_LIMIT` | videos/day per IP | 400 |
| `GLOBAL_DAILY_LIMIT` | videos/day across **everyone** (hard budget ceiling) | 5000 |
| `MAX_ITEMS` | max videos per request | 20 |
| `ARK_MODEL` | Doubao model id served to free users | doubao-seed-2-0-mini-260215 |

Counters are stored in KV (eventually consistent), so limits are approximate.
The `GLOBAL_DAILY_LIMIT` is your real safety net — even if abused, daily spend is
bounded. For strict per-user counting later, migrate the counters to a Durable Object.

## Test it

```bash
curl -X POST https://feed-focus-proxy.<you>.workers.dev/classify \
  -H 'content-type: application/json' \
  -H 'x-device-id: test-123' \
  -d '{"items":[{"id":"a1","t":"How Bridges Actually Work","c":"Practical Engineering","d":"14:22"}]}'
# → {"ok":true,"results":[{"id":"a1","v":"G"}],"modelId":"doubao-..."}
```
