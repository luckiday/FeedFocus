"use strict";
(() => {
  // src/shared/messages.ts
  var MSG_CLASSIFY_BATCH = "CLASSIFY_BATCH";
  var PORT_CLASSIFY_STREAM = "DOPAMINE_CLASSIFY_STREAM";

  // src/shared/settings.ts
  var SETTINGS_STORAGE_KEY = "feedFocusYoutubeSettings";
  var BATCH_MAX_MIN = 1;
  var BATCH_MAX_MAX = 50;
  var DEFAULT_BATCH_MAX = 10;
  function clampBatchMax(value) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return DEFAULT_BATCH_MAX;
    return Math.min(BATCH_MAX_MAX, Math.max(BATCH_MAX_MIN, Math.floor(n)));
  }
  function trimApiBaseUrl(url) {
    return url.replace(/\/+$/, "");
  }
  var ARK_KEY = "";
  var ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
  var DASHSCOPE_KEY = "";
  var DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  function resolveProviderForModel(modelId) {
    if (modelId.startsWith("doubao") || modelId.startsWith("ep-")) {
      return { key: ARK_KEY, baseUrl: ARK_BASE_URL };
    }
    return { key: DASHSCOPE_KEY, baseUrl: DASHSCOPE_BASE_URL };
  }
  var DEFAULT_SETTINGS = {
    modelId: "qwen-turbo",
    batchMax: DEFAULT_BATCH_MAX,
    verboseLogging: false
  };
  var MODEL_ID_MIGRATIONS = {
    "qwen-plus": "qwen3.6-plus",
    "qwen-flash": "qwen3.5-flash"
  };
  function migrateModelId(id) {
    return MODEL_ID_MIGRATIONS[id] ?? id;
  }
  function hydrateSettings(raw) {
    return {
      modelId: migrateModelId(
        typeof raw?.modelId === "string" ? raw.modelId : DEFAULT_SETTINGS.modelId
      ),
      batchMax: clampBatchMax(raw?.batchMax ?? DEFAULT_SETTINGS.batchMax),
      verboseLogging: typeof raw?.verboseLogging === "boolean" ? raw.verboseLogging : DEFAULT_SETTINGS.verboseLogging
    };
  }

  // src/background/env-bootstrap.ts
  function parseEnvText(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) {
        v = v.slice(1, -1);
      }
      if (k) out[k] = v;
    }
    return out;
  }
  function envToSettingsPatch(env) {
    const patch = {};
    const model = env.MODEL_ID || env.MODEL || env.DASHSCOPE_MODEL;
    if (model?.trim()) patch.modelId = model.trim();
    if (env.BATCH_MAX?.trim()) {
      patch.batchMax = clampBatchMax(Number(env.BATCH_MAX));
    }
    if (env.VERBOSE_LOGGING === "1" || /^true$/i.test(env.VERBOSE_LOGGING ?? "")) {
      patch.verboseLogging = true;
    }
    return patch;
  }
  async function bootstrapSettingsFromBundledEnv(reason) {
    const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const cur = raw[SETTINGS_STORAGE_KEY];
    const merged = hydrateSettings(cur);
    const needsMigration = typeof cur?.modelId === "string" && cur.modelId !== merged.modelId;
    let patch = {};
    try {
      const url = chrome.runtime.getURL(".env");
      const res = await fetch(url);
      if (res.ok) {
        patch = envToSettingsPatch(parseEnvText(await res.text()));
      }
    } catch {
    }
    const hasPatch = patch.modelId !== void 0 || patch.batchMax !== void 0 || patch.verboseLogging !== void 0;
    if (!needsMigration && !hasPatch) return;
    const overwrite = reason === chrome.runtime.OnInstalledReason.INSTALL;
    if (patch.modelId !== void 0 && (overwrite || !merged.modelId))
      merged.modelId = patch.modelId;
    if (patch.batchMax !== void 0 && (overwrite || merged.batchMax === DEFAULT_SETTINGS.batchMax))
      merged.batchMax = patch.batchMax;
    if (patch.verboseLogging !== void 0 && (overwrite || !merged.verboseLogging))
      merged.verboseLogging = patch.verboseLogging;
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: merged });
  }

  // src/background/ark-classify.ts
  var SYSTEM_PROMPT = `You are a fast, objective cognitive-load classifier for YouTube videos. Your goal is to estimate *stimulation / pacing cost* and *attention quality* of a video based on its tile metadata, not its surface topic.

# Core principle
The category is NOT determined by topic (education / entertainment), but by:
1. **Pacing & stimulation density** \u2014 how rapidly the brain is hit with novelty/emotion.
2. **Engagement quality** \u2014 does the viewer leave inspired-to-act, calmer, or hollow/agitated?
3. **Algorithmic intent** \u2014 was it engineered for retention/clicks, or for genuine value?

A long video can still be R. A short video can still be G. Duration alone is weak signal.

# Categories

## G (Green) \u2014 Restorative or genuinely deep
Slow pacing, low stimulation density, leaves viewer wanting to *create* or *think*.
Examples:
- Long-form documentaries, lectures, academic talks
- Programming tutorials, technical deep-dives, code-alongs
- Photography / cooking / woodworking / craft tutorials with stable shots
- Slow travel vlogs, nature footage, hiking, sailing, "day in the life" without hype
- Long-form interviews / podcasts (>30 min) with calm hosts
- Music performances, classical, jazz sets
- Repair, restoration, gardening, slow-living content

## Y (Yellow) \u2014 Standard entertainment, neutral
Normal pacing, moderate stimulation, neither restorative nor harmful.
Examples:
- Standard tech reviews (not hype-driven)
- News explainers from established outlets, calm tone
- Gaming playthroughs without rage-bait
- Standard product reviews, unboxings
- Movie/show reviews, recap content
- Casual vlogs with average editing pace

## R (Red) \u2014 High stimulation, attention-extractive
Fast cuts, emotional peaks, engineered for retention. Often *disguised as* education or news.
Watch out for these "wolf in sheep's clothing" patterns:
- "X minutes to explain Y" / "Everything you need to know about Z" \u2192 compressed-information bait
- Political commentary with outrage hooks, "destroyed", "exposed", "the truth about"
- Crypto/finance hype, "this will change everything", get-rich content
- Reaction videos, drama channels, gossip
- Hyper-edited tech/gadget content with constant cuts
- Self-improvement content with manufactured urgency ("do this NOW")
- Conspiracy, doom-scrolling current events
- Most Shorts (when short:true, default to R unless title strongly suggests calm/educational content)
- Top 10 / ranking videos with clickbait framing

# Signals to weight (in priority order)

1. **Title language patterns**
   - ALL CAPS words, multiple "!", clickbait emoji (\u{1F525}\u{1F480}\u{1F631}\u{1F6A8}) \u2192 R bias
   - "How to", "Tutorial", "Walkthrough", "Explained" + calm channel \u2192 G bias
   - "Truth about", "Exposed", "Destroyed", "Won't believe" \u2192 R bias
   - Specific technical terms, proper nouns, place names \u2192 G bias

2. **Channel name / handle character**
   - Established educational brands (e.g., 3Blue1Brown, Veritasium, Practical Engineering, Kurzgesagt) \u2192 G
   - News commentary / political channels \u2192 usually R
   - "Daily X", "X News" with hype framing \u2192 R
   - Personal craft/hobby channels \u2192 usually G

3. **Duration (d) as supporting signal**
   - <60s or short:true \u2192 strong R bias
   - 1\u20134 min \u2192 R bias unless clearly tutorial
   - 8\u201325 min with educational title \u2192 likely G
   - 25+ min interview/documentary \u2192 likely G

4. **View count (vc) \u2014 weak signal**
   - Extreme virality (10M+) on recent uploads can correlate with R, but not reliable. Use only as tiebreaker.

5. **Conflict resolution**
   - Title vs channel disagreement \u2192 trust channel pattern more
   - Educational topic + clickbait title \u2192 R (the format wins over the topic)

# Examples (few-shot)

Input: {"id":"a1","t":"How Bridges Actually Work","c":"Practical Engineering","d":"14:22","short":false}
\u2192 {"id":"a1","v":"G"}  // calm channel, technical, normal duration

Input: {"id":"a2","t":"This Bridge Collapse Will SHOCK You \u{1F631}","c":"Daily Engineering News","d":"8:45","short":false}
\u2192 {"id":"a2","v":"R"}  // emotional bait, even though topic overlaps with G example

Input: {"id":"a3","t":"5 Minutes to Master Photography Composition","c":"PhotoTips","d":"5:12","short":false}
\u2192 {"id":"a3","v":"R"}  // compressed-info pattern, designed for retention not learning

Input: {"id":"a4","t":"Photography Composition: Leading Lines Tutorial","c":"Sean Tucker","d":"18:30","short":false}
\u2192 {"id":"a4","v":"G"}  // same topic, real tutorial format

Input: {"id":"a5","t":"iPhone 17 Pro Review","c":"MKBHD","d":"16:04","short":false}
\u2192 {"id":"a5","v":"Y"}  // standard tech review, neither extractive nor restorative

Input: {"id":"a6","t":"They Don't Want You to Know This About the Economy","c":"Truth Hour","d":"22:11","short":false}
\u2192 {"id":"a6","v":"R"}  // outrage bait disguised as long-form analysis

Input: {"id":"a7","t":"Sailing Across the Pacific - Day 47","c":"Sailing La Vagabonde","d":"24:18","short":false}
\u2192 {"id":"a7","v":"G"}  // slow travel vlog, restorative

Input: {"id":"a8","t":"POV: You Just Got Promoted","c":"corporate.life","short":true}
\u2192 {"id":"a8","v":"R"}  // Shorts default

# INPUT
JSON array. Each object MUST include:
- id: unique identifier
- t: title
- c: channel display name

Optional (omit if unknown):
- d: duration label, e.g. "21:56" or "1:15:03"
- vc: view count as shown, e.g. "685K"
- pub: upload/freshness text, e.g. "1y ago"
- h: channel handle, e.g. "@SomeChannel"
- short: true if the tile is a Shorts link

# OUTPUT
Return ONLY a valid JSON array. No prose, no markdown fences.
Each object: {"id": "<same id as input>", "v": "G"|"Y"|"R"}
Prefer one compact object per line inside the array (no extra spaces) so clients can update progressively.

If a video is genuinely ambiguous, default to Y. Reserve R for clear extraction signals and G for clear restorative signals.`;
  function parseTier(v) {
    if (typeof v !== "string") return null;
    const u = v.toUpperCase();
    if (u === "G" || u === "Y" || u === "R") return u;
    return null;
  }
  function extractJsonArray(text) {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let raw = (fence ? fence[1] : trimmed).trim();
    try {
      return JSON.parse(raw);
    } catch {
      const start = trimmed.indexOf("[");
      const end = trimmed.lastIndexOf("]");
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
      throw new Error("invalid_json");
    }
  }
  function buildResultsFromParsed(raw, expectedIds) {
    if (!Array.isArray(raw)) {
      throw new Error("LLM output is not a JSON array");
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const id = row.id;
      const v = row.v;
      if (typeof id !== "string" || !expectedIds.has(id)) continue;
      const tier = parseTier(v);
      if (!tier) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, v: tier });
    }
    return out;
  }
  function pullCompleteTierObjects(text, expectedIds, alreadyEmitted) {
    const out = [];
    const re = /\{\s*"id"\s*:\s*"([^"]*)"\s*,\s*"v"\s*:\s*"(G|Y|R)"\s*\}/gi;
    for (const m of text.matchAll(re)) {
      const id = m[1];
      const v = m[2].toUpperCase();
      if (!expectedIds.has(id) || alreadyEmitted.has(id)) continue;
      alreadyEmitted.add(id);
      out.push({ id, v });
    }
    return out;
  }
  async function* sseAssistantTextChunks(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let carry = "";
    try {
      let doneReading = false;
      while (!doneReading) {
        const { done, value } = await reader.read();
        doneReading = done;
        carry += value ? decoder.decode(value, { stream: !done }) : "";
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          const piece = json?.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece.length > 0) yield piece;
        }
      }
      const tail = carry.trim();
      if (tail.startsWith("data:")) {
        const data = tail.slice(5).trim();
        if (data && data !== "[DONE]") {
          try {
            const json = JSON.parse(data);
            const piece = json?.choices?.[0]?.delta?.content;
            if (typeof piece === "string" && piece.length > 0) yield piece;
          } catch {
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  function classifyFromAssistantText(text, expectedIds, model) {
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: "empty_model_content" };
    }
    let parsed;
    try {
      parsed = extractJsonArray(trimmed);
    } catch {
      return { ok: false, error: "invalid_json_in_model_output" };
    }
    try {
      const results = buildResultsFromParsed(parsed, expectedIds);
      if (results.length === 0 && expectedIds.size > 0) {
        return { ok: false, error: "no_matching_ids_in_model_output" };
      }
      return { ok: true, results, modelId: model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "parse_failed";
      return { ok: false, error: msg };
    }
  }
  async function classifyBatchArkStream(settings, items, onPartial) {
    const model = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;
    const { key, baseUrl: resolvedBase } = resolveProviderForModel(model);
    const base = trimApiBaseUrl(resolvedBase);
    const url = `${base}/chat/completions`;
    const expectedIds = new Set(items.map((x) => x.id));
    const userPayload = `INPUT:
${JSON.stringify(items)}

Return ONLY a valid JSON array in the OUTPUT FORMAT specified in your instructions. No other text.`;
    const body = {
      model,
      temperature: 0.2,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload }
      ]
    };
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch_failed";
      return { ok: false, error: msg };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `http_${res.status}:${t.slice(0, 200)}` };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/event-stream") || !res.body) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string") {
        return { ok: false, error: "empty_model_content" };
      }
      return classifyFromAssistantText(text, expectedIds, model);
    }
    const emitted = /* @__PURE__ */ new Set();
    const merged = /* @__PURE__ */ new Map();
    let accum = "";
    try {
      for await (const chunk of sseAssistantTextChunks(res.body)) {
        accum += chunk;
        const fresh = pullCompleteTierObjects(accum, expectedIds, emitted);
        for (const r of fresh) merged.set(r.id, r.v);
        if (fresh.length > 0) onPartial(fresh);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "stream_read_failed";
      return { ok: false, error: msg };
    }
    const finals = classifyFromAssistantText(accum, expectedIds, model);
    if (finals.ok) return finals;
    if (merged.size === 0) return finals;
    const results = [];
    for (const [id, v] of merged) {
      if (expectedIds.has(id)) results.push({ id, v });
    }
    if (results.length === 0) return finals;
    return { ok: true, results, modelId: model };
  }
  async function classifyBatchArk(settings, items) {
    const model = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;
    const { key, baseUrl: resolvedBase } = resolveProviderForModel(model);
    const base = trimApiBaseUrl(resolvedBase);
    const url = `${base}/chat/completions`;
    const expectedIds = new Set(items.map((x) => x.id));
    const userPayload = `INPUT:
${JSON.stringify(items)}

Return ONLY a valid JSON array in the OUTPUT FORMAT specified in your instructions. No other text.`;
    const body = {
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload }
      ]
    };
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch_failed";
      return { ok: false, error: msg };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `http_${res.status}:${t.slice(0, 200)}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "empty_model_content" };
    }
    return classifyFromAssistantText(text, expectedIds, model);
  }
  async function loadSettings() {
    const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    return hydrateSettings(raw[SETTINGS_STORAGE_KEY]);
  }

  // src/background/background.ts
  chrome.runtime.onInstalled.addListener((details) => {
    void bootstrapSettingsFromBundledEnv(details.reason);
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_CLASSIFY_STREAM) return;
    let portAlive = true;
    port.onDisconnect.addListener(() => {
      portAlive = false;
    });
    function safePost(msg) {
      if (!portAlive) return;
      try {
        port.postMessage(msg);
      } catch {
        portAlive = false;
      }
    }
    port.onMessage.addListener((raw) => {
      void (async () => {
        const msg = raw;
        try {
          const items = msg?.items;
          if (!Array.isArray(items) || items.length === 0) {
            safePost({
              type: "final",
              response: { ok: false, error: "empty_batch" }
            });
            return;
          }
          const settings = await loadSettings();
          const modelId = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;
          const res = await classifyBatchArkStream(settings, items, (partial) => {
            safePost({
              type: "partial",
              results: partial,
              modelId
            });
          });
          safePost({ type: "final", response: res });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "classify_stream_failed";
          safePost({
            type: "final",
            response: { ok: false, error: errMsg }
          });
        }
      })();
    });
  });
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      if (!message || message.type !== MSG_CLASSIFY_BATCH) {
        return false;
      }
      const items = message.items;
      if (!Array.isArray(items) || items.length === 0) {
        sendResponse({ ok: false, error: "empty_batch" });
        return false;
      }
      void (async () => {
        const settings = await loadSettings();
        const res = await classifyBatchArk(settings, items);
        sendResponse(res);
      })();
      return true;
    }
  );
})();
