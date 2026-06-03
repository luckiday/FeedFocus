/**
 * Feed Focus — free-tier classify proxy (Cloudflare Worker).
 *
 * Holds the Volcengine Ark API key server-side and exposes a single
 * POST /classify endpoint for the extension's "Free" mode. Enforces
 * per-device, per-IP, and a global daily cap (the global cap is the hard
 * safety net that bounds token spend even under abuse).
 *
 * Counters live in Workers KV (binding: FEED_FOCUS_KV). KV is eventually
 * consistent, so limits are approximate — fine for a soft free tier. For
 * strict counting, swap to a Durable Object.
 *
 * Config: see wrangler.toml [vars]; ARK_API_KEY is a secret
 * (`wrangler secret put ARK_API_KEY`).
 */

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const SYSTEM_PROMPT = `You are a fast, objective cognitive-load classifier for YouTube videos. Your goal is to estimate *stimulation / pacing cost* and *attention quality* of a video based on its tile metadata, not its surface topic.

# Core principle
The category is NOT determined by topic (education / entertainment), but by:
1. **Pacing & stimulation density** — how rapidly the brain is hit with novelty/emotion.
2. **Engagement quality** — does the viewer leave inspired-to-act, calmer, or hollow/agitated?
3. **Algorithmic intent** — was it engineered for retention/clicks, or for genuine value?

A long video can still be R. A short video can still be G. Duration alone is weak signal.

# Categories
## G (Green) — Restorative or genuinely deep
Slow pacing, low stimulation density, leaves viewer wanting to *create* or *think*.
Documentaries, lectures, technical deep-dives, craft tutorials with stable shots, slow travel/nature, long calm interviews/podcasts, music performances, repair/restoration/gardening.

## Y (Yellow) — Standard entertainment, neutral
Normal pacing, moderate stimulation. Standard tech/product reviews, calm news explainers, gaming playthroughs without rage-bait, recaps, casual vlogs.

## R (Red) — High stimulation, attention-extractive
Fast cuts, emotional peaks, engineered for retention; often disguised as education/news.
"X minutes to explain Y" bait, outrage commentary ("destroyed", "exposed", "truth about"), crypto/finance hype, reaction/drama/gossip, hyper-edited content, manufactured-urgency self-improvement, conspiracy/doom, most Shorts (short:true defaults to R unless clearly calm/educational), clickbait Top-10/rankings.

# Signals (priority order)
1. Title patterns: ALL CAPS / multiple "!" / 🔥💀😱🚨 → R. "How to/Tutorial/Explained" + calm channel → G. "Truth about/Exposed/Won't believe" → R. Specific technical terms / proper nouns → G.
2. Channel character: established educational brands → G; news commentary / political → usually R; personal craft/hobby → usually G.
3. Duration: <60s or short:true → strong R bias; 1–4 min → R unless clearly tutorial; 8–25 min educational → likely G; 25+ min interview/doc → likely G.
4. View count — weak tiebreaker only.
5. Conflicts: title vs channel disagreement → trust channel; educational topic + clickbait title → R (format beats topic).

# INPUT
JSON array; each object has id, t (title), c (channel); optional d (duration), vc (views), pub (freshness), h (handle), short (bool).

# OUTPUT
Return ONLY a valid JSON array. No prose, no markdown fences. Each object: {"id":"<same id>","v":"G"|"Y"|"R"}. One compact object per line. If genuinely ambiguous, default to Y. Reserve R for clear extraction signals, G for clear restorative signals.`;

function cors(resp) {
  resp.headers.set("Access-Control-Allow-Origin", "*");
  resp.headers.set("Access-Control-Allow-Headers", "content-type,x-device-id");
  resp.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  return resp;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 64) : null;
  if (!id) return null;
  const item = {
    id,
    t: typeof raw.t === "string" ? raw.t.slice(0, 200) : "",
    c: typeof raw.c === "string" ? raw.c.slice(0, 100) : "",
  };
  if (typeof raw.d === "string") item.d = raw.d.slice(0, 16);
  if (typeof raw.vc === "string") item.vc = raw.vc.slice(0, 24);
  if (typeof raw.pub === "string") item.pub = raw.pub.slice(0, 32);
  if (typeof raw.h === "string") item.h = raw.h.slice(0, 64);
  if (raw.short === true) item.short = true;
  return item;
}

async function getCount(kv, key) {
  const v = await kv.get(key);
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function bump(kv, key, by) {
  const cur = await getCount(kv, key);
  // ~2 day TTL so daily keys self-expire.
  await kv.put(key, String(cur + by), { expirationTtl: 172800 });
}

function extractTiers(text, expectedIds) {
  const out = [];
  const seen = new Set();
  const re = /\{\s*"id"\s*:\s*"([^"]*)"\s*,\s*"v"\s*:\s*"(G|Y|R)"\s*\}/gi;
  for (const m of text.matchAll(re)) {
    const id = m[1];
    const v = m[2].toUpperCase();
    if (!expectedIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, v });
  }
  return out;
}

async function callArk(env, items) {
  const base = (env.ARK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = env.ARK_MODEL || "doubao-seed-2-0-mini-260428";
  const userPayload = `INPUT:\n${JSON.stringify(items)}\n\nReturn ONLY a valid JSON array of {"id","v"} objects. No other text.`;

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ARK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        // Doubao seed models reason by default (~13× the tokens). The classifier
        // doesn't need it, and the detailed system prompt carries the nuance.
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ark_fetch_failed" };
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `ark_http_${res.status}:${t.slice(0, 150)}` };
  }

  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "ark_empty" };
  }
  const expectedIds = new Set(items.map((x) => x.id));
  return { ok: true, results: extractTiers(text, expectedIds), modelId: model };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return cors(json({ error: "method_not_allowed" }, 405));

    const url = new URL(request.url);
    if (url.pathname !== "/classify") return cors(json({ error: "not_found" }, 404));

    let payload;
    try {
      payload = await request.json();
    } catch {
      return cors(json({ error: "bad_json" }, 400));
    }

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    const MAX_ITEMS = Number(env.MAX_ITEMS || 20);
    const items = rawItems.slice(0, MAX_ITEMS).map(sanitizeItem).filter(Boolean);
    if (items.length === 0) return cors(json({ error: "empty_batch" }, 400));

    const kv = env.FEED_FOCUS_KV;
    const date = new Date().toISOString().slice(0, 10);
    const device = (request.headers.get("x-device-id") || "anon").slice(0, 64);
    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";

    const GLOBAL_LIMIT = Number(env.GLOBAL_DAILY_LIMIT || 5000);
    const DEVICE_LIMIT = Number(env.DEVICE_DAILY_LIMIT || 200);
    const IP_LIMIT = Number(env.IP_DAILY_LIMIT || 400);

    const gKey = `g:${date}`;
    const dKey = `d:${device}:${date}`;
    const iKey = `i:${ip}:${date}`;

    const [gC, dC, iC] = await Promise.all([
      getCount(kv, gKey),
      getCount(kv, dKey),
      getCount(kv, iKey),
    ]);

    if (gC >= GLOBAL_LIMIT) return cors(json({ error: "global_cap" }, 429));
    if (dC >= DEVICE_LIMIT) return cors(json({ error: "rate_limited", scope: "device" }, 429));
    if (iC >= IP_LIMIT) return cors(json({ error: "rate_limited", scope: "ip" }, 429));

    const result = await callArk(env, items);
    if (!result.ok) return cors(json({ error: result.error }, 502));

    const n = items.length;
    ctx.waitUntil(
      Promise.all([bump(kv, gKey, n), bump(kv, dKey, n), bump(kv, iKey, n)])
    );

    return cors(json({ ok: true, results: result.results, modelId: result.modelId }));
  },
};
