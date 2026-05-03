import {
  DEFAULT_SETTINGS,
  hydrateSettings,
  resolveProviderForModel,
  SETTINGS_STORAGE_KEY,
  trimApiBaseUrl,
  type FeedFocusSettings,
} from "../shared/settings";
import type {
  ClassifyBatchItem,
  ClassifyBatchResponse,
  TierLetter,
} from "../shared/messages";

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
Examples:
- Long-form documentaries, lectures, academic talks
- Programming tutorials, technical deep-dives, code-alongs
- Photography / cooking / woodworking / craft tutorials with stable shots
- Slow travel vlogs, nature footage, hiking, sailing, "day in the life" without hype
- Long-form interviews / podcasts (>30 min) with calm hosts
- Music performances, classical, jazz sets
- Repair, restoration, gardening, slow-living content

## Y (Yellow) — Standard entertainment, neutral
Normal pacing, moderate stimulation, neither restorative nor harmful.
Examples:
- Standard tech reviews (not hype-driven)
- News explainers from established outlets, calm tone
- Gaming playthroughs without rage-bait
- Standard product reviews, unboxings
- Movie/show reviews, recap content
- Casual vlogs with average editing pace

## R (Red) — High stimulation, attention-extractive
Fast cuts, emotional peaks, engineered for retention. Often *disguised as* education or news.
Watch out for these "wolf in sheep's clothing" patterns:
- "X minutes to explain Y" / "Everything you need to know about Z" → compressed-information bait
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
   - ALL CAPS words, multiple "!", clickbait emoji (🔥💀😱🚨) → R bias
   - "How to", "Tutorial", "Walkthrough", "Explained" + calm channel → G bias
   - "Truth about", "Exposed", "Destroyed", "Won't believe" → R bias
   - Specific technical terms, proper nouns, place names → G bias

2. **Channel name / handle character**
   - Established educational brands (e.g., 3Blue1Brown, Veritasium, Practical Engineering, Kurzgesagt) → G
   - News commentary / political channels → usually R
   - "Daily X", "X News" with hype framing → R
   - Personal craft/hobby channels → usually G

3. **Duration (d) as supporting signal**
   - <60s or short:true → strong R bias
   - 1–4 min → R bias unless clearly tutorial
   - 8–25 min with educational title → likely G
   - 25+ min interview/documentary → likely G

4. **View count (vc) — weak signal**
   - Extreme virality (10M+) on recent uploads can correlate with R, but not reliable. Use only as tiebreaker.

5. **Conflict resolution**
   - Title vs channel disagreement → trust channel pattern more
   - Educational topic + clickbait title → R (the format wins over the topic)

# Examples (few-shot)

Input: {"id":"a1","t":"How Bridges Actually Work","c":"Practical Engineering","d":"14:22","short":false}
→ {"id":"a1","v":"G"}  // calm channel, technical, normal duration

Input: {"id":"a2","t":"This Bridge Collapse Will SHOCK You 😱","c":"Daily Engineering News","d":"8:45","short":false}
→ {"id":"a2","v":"R"}  // emotional bait, even though topic overlaps with G example

Input: {"id":"a3","t":"5 Minutes to Master Photography Composition","c":"PhotoTips","d":"5:12","short":false}
→ {"id":"a3","v":"R"}  // compressed-info pattern, designed for retention not learning

Input: {"id":"a4","t":"Photography Composition: Leading Lines Tutorial","c":"Sean Tucker","d":"18:30","short":false}
→ {"id":"a4","v":"G"}  // same topic, real tutorial format

Input: {"id":"a5","t":"iPhone 17 Pro Review","c":"MKBHD","d":"16:04","short":false}
→ {"id":"a5","v":"Y"}  // standard tech review, neither extractive nor restorative

Input: {"id":"a6","t":"They Don't Want You to Know This About the Economy","c":"Truth Hour","d":"22:11","short":false}
→ {"id":"a6","v":"R"}  // outrage bait disguised as long-form analysis

Input: {"id":"a7","t":"Sailing Across the Pacific - Day 47","c":"Sailing La Vagabonde","d":"24:18","short":false}
→ {"id":"a7","v":"G"}  // slow travel vlog, restorative

Input: {"id":"a8","t":"POV: You Just Got Promoted","c":"corporate.life","short":true}
→ {"id":"a8","v":"R"}  // Shorts default

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

function parseTier(v: unknown): TierLetter | null {
  if (typeof v !== "string") return null;
  const u = v.toUpperCase();
  if (u === "G" || u === "Y" || u === "R") return u;
  return null;
}

function extractJsonArray(text: string): unknown {
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

function buildResultsFromParsed(
  raw: unknown,
  expectedIds: Set<string>
): { id: string; v: TierLetter }[] {
  if (!Array.isArray(raw)) {
    throw new Error("LLM output is not a JSON array");
  }
  const out: { id: string; v: TierLetter }[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    const v = (row as { v?: unknown }).v;
    if (typeof id !== "string" || !expectedIds.has(id)) continue;
    const tier = parseTier(v);
    if (!tier) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, v: tier });
  }
  return out;
}

/** Pull fully-closed {id,v} objects from a growing model string (SSE incremental decode). */
function pullCompleteTierObjects(
  text: string,
  expectedIds: Set<string>,
  alreadyEmitted: Set<string>
): { id: string; v: TierLetter }[] {
  const out: { id: string; v: TierLetter }[] = [];
  const re = /\{\s*"id"\s*:\s*"([^"]*)"\s*,\s*"v"\s*:\s*"(G|Y|R)"\s*\}/gi;
  for (const m of text.matchAll(re)) {
    const id = m[1];
    const v = m[2].toUpperCase() as TierLetter;
    if (!expectedIds.has(id) || alreadyEmitted.has(id)) continue;
    alreadyEmitted.add(id);
    out.push({ id, v });
  }
  return out;
}

async function* sseAssistantTextChunks(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
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
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const piece = (json as { choices?: { delta?: { content?: string } }[] })
          ?.choices?.[0]?.delta?.content;
        if (typeof piece === "string" && piece.length > 0) yield piece;
      }
    }
    const tail = carry.trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const piece = json?.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece.length > 0) yield piece;
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function classifyFromAssistantText(
  text: string,
  expectedIds: Set<string>,
  model: string
): ClassifyBatchResponse {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "empty_model_content" };
  }
  let parsed: unknown;
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

/** Stream completion; emits incremental {id,v} rows as soon as each JSON object is closed in the buffer. */
export async function classifyBatchArkStream(
  settings: FeedFocusSettings,
  items: ClassifyBatchItem[],
  onPartial: (results: { id: string; v: TierLetter }[]) => void
): Promise<ClassifyBatchResponse> {
  const model = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;
  const { key, baseUrl: resolvedBase } = resolveProviderForModel(model);
  const base = trimApiBaseUrl(resolvedBase);
  const url = `${base}/chat/completions`;

  const expectedIds = new Set(items.map((x) => x.id));
  const userPayload = `INPUT:\n${JSON.stringify(items)}\n\nReturn ONLY a valid JSON array in the OUTPUT FORMAT specified in your instructions. No other text.`;

  const body = {
    model,
    temperature: 0.2,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return { ok: false, error: "empty_model_content" };
    }
    return classifyFromAssistantText(text, expectedIds, model);
  }

  const emitted = new Set<string>();
  const merged = new Map<string, TierLetter>();
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

  const results: { id: string; v: TierLetter }[] = [];
  for (const [id, v] of merged) {
    if (expectedIds.has(id)) results.push({ id, v });
  }
  if (results.length === 0) return finals;

  return { ok: true, results, modelId: model };
}

export async function classifyBatchArk(
  settings: FeedFocusSettings,
  items: ClassifyBatchItem[]
): Promise<ClassifyBatchResponse> {
  const model = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;
  const { key, baseUrl: resolvedBase } = resolveProviderForModel(model);
  const base = trimApiBaseUrl(resolvedBase);
  const url = `${base}/chat/completions`;

  const expectedIds = new Set(items.map((x) => x.id));
  const userPayload = `INPUT:\n${JSON.stringify(items)}\n\nReturn ONLY a valid JSON array in the OUTPUT FORMAT specified in your instructions. No other text.`;

  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { ok: false, error: msg };
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `http_${res.status}:${t.slice(0, 200)}` };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "empty_model_content" };
  }

  return classifyFromAssistantText(text, expectedIds, model);
}

export async function loadSettings(): Promise<FeedFocusSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return hydrateSettings(raw[SETTINGS_STORAGE_KEY] as Partial<FeedFocusSettings> | undefined);
}
