import {
  PORT_CLASSIFY_STREAM,
  type ClassifyBatchItem,
  type ClassifyBatchResponse,
  type ClassifyStreamPortClientMsg,
  type ClassifyStreamPortServerMsg,
  type TierLetter,
} from "../shared/messages";
import {
  hydrateSettings,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
} from "../shared/settings";
import { EXTENSION_LOG_PREFIX, EXTENSION_SHORT_NAME } from "../shared/branding";
import { tierCacheGet, tierCachePutMany } from "../shared/tier-cache";
import { logClassification } from "./classification-log";
import type { AttentionTier } from "./heuristics";
import { HEURISTIC_TIER_KEY, MARKER_CLASS, paintMarker } from "./markers";
import { normalizeClassifyBatchItem } from "../shared/normalize-llm-input";
import { getChannelName, getTitle, getVideoId } from "./yt-dom";

/**
 * Latency tunables (see README "Latency"):
 * - FLUSH_MS: max wait after last enqueue before sending (lower = snappier, more calls).
 * - batchMax: max items per HTTP request — set in the extension popup (1–50).
 * - MAX_CONCURRENT_FLUSHES: parallel in-flight Ark requests (2 = pipeline; set 1 if rate-limited).
 */
const FLUSH_MS = 1000;
const MAX_CONCURRENT_FLUSHES = 2;

type PendingEntry = { item: ClassifyBatchItem; cards: HTMLElement[] };

const pending = new Map<string, PendingEntry>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightFlushes = 0;

/** FIFO-ish: take up to maxKeys entries out of `pending` for one request. */
function takeBatchSnapshot(maxKeys: number): Map<string, PendingEntry> {
  const snap = new Map<string, PendingEntry>();
  let n = 0;
  for (const [id, entry] of pending) {
    if (n >= maxKeys) break;
    snap.set(id, entry);
    pending.delete(id);
    n++;
  }
  return snap;
}

function scheduleDebounceFlush(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushQueue();
  }, FLUSH_MS);
}

export function resetLlmQueue(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pending.clear();
}

export async function loadSettingsSnapshot(): Promise<FeedFocusSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return hydrateSettings(raw[SETTINGS_STORAGE_KEY] as Partial<FeedFocusSettings> | undefined);
}

function sendClassifyBatchStreaming(
  items: ClassifyBatchItem[],
  onPartial: (results: { id: string; v: TierLetter }[], modelId: string) => void
): Promise<ClassifyBatchResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const port = chrome.runtime.connect({ name: PORT_CLASSIFY_STREAM });
    const finish = (r: ClassifyBatchResponse) => {
      if (settled) return;
      settled = true;
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    port.onMessage.addListener((msg: ClassifyStreamPortServerMsg) => {
      if (msg.type === "partial") {
        onPartial(msg.results, msg.modelId);
      } else if (msg.type === "final") {
        finish(msg.response);
      }
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        finish({
          ok: false,
          error: chrome.runtime.lastError?.message ?? "port_disconnected",
        });
      }
    });
    const payload: ClassifyStreamPortClientMsg = { items };
    port.postMessage(payload);
  });
}

function mergeBatchItem(
  prev: ClassifyBatchItem,
  next: ClassifyBatchItem
): ClassifyBatchItem {
  const m: ClassifyBatchItem = {
    id: prev.id,
    t: next.t || prev.t,
    c: next.c || prev.c,
  };
  if (next.d || prev.d) m.d = next.d || prev.d;
  if (next.vc || prev.vc) m.vc = next.vc || prev.vc;
  if (next.pub || prev.pub) m.pub = next.pub || prev.pub;
  if (next.h || prev.h) m.h = next.h || prev.h;
  if (next.short || prev.short) m.short = true;
  return normalizeClassifyBatchItem(m);
}

function tierLetterToTier(v: string): AttentionTier | null {
  const u = v.toUpperCase();
  if (u === "G" || u === "Y" || u === "R") return u;
  return null;
}

function readHeuristicTier(card: HTMLElement): AttentionTier | null {
  const raw = card.dataset[HEURISTIC_TIER_KEY];
  if (raw === "G" || raw === "Y" || raw === "R") return raw;
  return null;
}

/** After failed batch or missing id in response: gray dot; tier stays in tooltip as rule hint only. */
export function applyHeuristicFallbackFromPending(card: HTMLElement): void {
  const tier = readHeuristicTier(card);
  const dot = card.querySelector<HTMLElement>(`.${MARKER_CLASS}`);
  if (!dot) return;
  paintMarker(card, dot, { kind: "heuristic" });
  dot.title = tier
    ? `${EXTENSION_SHORT_NAME}: no model tier (gray). Rule hint: ${tier}.`
    : `${EXTENSION_SHORT_NAME}: no model tier (gray).`;
}

/** Apply a tier from persistent cache (skips network). */
export function applyCachedLlmTierToCard(
  card: HTMLElement,
  tierLetter: string,
  storedModelId: string
): void {
  const tier = tierLetterToTier(tierLetter);
  if (!tier) return;

  const dot = card.querySelector<HTMLElement>(`.${MARKER_CLASS}`);
  if (!dot) return;

  paintMarker(card, dot, { kind: "tier", tier });
  dot.title = `${EXTENSION_SHORT_NAME}: cached LLM (${storedModelId}) · ${tier}`;

  const title = getTitle(card) ?? "";
  const channel = getChannelName(card) ?? "";
  const videoId = getVideoId(card);

  logClassification({
    method: "llm_cached",
    videoId,
    title,
    channel,
    tier,
    detail: ["source:tier_cache"],
    modelId: storedModelId,
  });
}

export function applyLlmTierToCard(
  card: HTMLElement,
  tierLetter: string,
  modelId: string
): void {
  const tier = tierLetterToTier(tierLetter);
  if (!tier) return;

  const dot = card.querySelector<HTMLElement>(`.${MARKER_CLASS}`);
  if (!dot) return;

  paintMarker(card, dot, { kind: "tier", tier });
  dot.title = `${EXTENSION_SHORT_NAME}: LLM (${modelId}) · ${tier}`;

  const title = getTitle(card) ?? "";
  const channel = getChannelName(card) ?? "";
  const videoId = getVideoId(card);

  logClassification({
    method: "llm",
    videoId,
    title,
    channel,
    tier,
    detail: [`model:${modelId}`, `tier:${tier}`],
    modelId,
  });
}

/**
 * Queue this card for Ark batch classification. No-op without API key.
 */
export async function enqueueCardForLlm(
  card: HTMLElement,
  item: ClassifyBatchItem
): Promise<void> {
  const settings = await loadSettingsSnapshot();

  const id = item.id;
  const cached = await tierCacheGet(id);
  if (cached) {
    if (card.isConnected) applyCachedLlmTierToCard(card, cached.v, cached.m);
    return;
  }

  let entry = pending.get(id);
  if (!entry) {
    entry = { item: { ...item }, cards: [] };
    pending.set(id, entry);
  } else {
    entry.item = mergeBatchItem(entry.item, item);
  }
  if (!entry.cards.includes(card)) entry.cards.push(card);

  if (pending.size >= settings.batchMax) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void flushQueue();
  } else {
    scheduleDebounceFlush();
  }
}

async function flushQueue(): Promise<void> {
  if (pending.size === 0) return;
  if (inFlightFlushes >= MAX_CONCURRENT_FLUSHES) return;

  const settings = await loadSettingsSnapshot();
  const batchMax = settings.batchMax;
  const snapshot = takeBatchSnapshot(batchMax);
  if (snapshot.size === 0) return;

  inFlightFlushes++;

  try {
    const { verboseLogging } = settings;

    const items: ClassifyBatchItem[] = [];
    for (const [, v] of snapshot) {
      items.push(v.item);
    }

    const appliedLlmIds = new Set<string>();

    const res = await sendClassifyBatchStreaming(items, (partial, modelId) => {
      const cacheRows: { id: string; v: TierLetter; modelId: string }[] = [];
      for (const r of partial) {
        const entry = snapshot.get(r.id);
        if (!entry || appliedLlmIds.has(r.id)) continue;
        appliedLlmIds.add(r.id);
        cacheRows.push({ id: r.id, v: r.v, modelId });
        for (const card of entry.cards) {
          if (card.isConnected) applyLlmTierToCard(card, r.v, modelId);
        }
      }
      tierCachePutMany(cacheRows);
    });

    if (!res.ok) {
      const errStr = String(res.error);
      if (errStr.includes("global_cap")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} Free tier is at today's global limit for everyone. Try later, or switch to your own API key in the popup for unlimited use.`,
          res.error
        );
      } else if (errStr.includes("rate_limited")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} You hit today's free-tier limit. Switch to your own API key in the popup for higher limits.`,
          res.error
        );
      } else if (errStr.includes("proxy_not_configured")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} Free mode isn't configured in this build. Set PROXY_BASE_URL (src/shared/config.ts) or switch to your own API key in the popup.`,
          res.error
        );
      } else if (errStr.includes("no_api_key")) {
        const provider = errStr.endsWith("ark") ? "Ark" : "DashScope";
        console.warn(
          `${EXTENSION_LOG_PREFIX} LLM skipped — no API key. Open the extension popup and paste your ${provider} API key for the selected model. Tiles fall back to gray rule hints until then.`,
          res.error
        );
      } else if (errStr.includes("http_401")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} LLM skipped (401 invalid/expired key). Open the extension popup and confirm the API key matches the provider for your selected model.`,
          res.error
        );
      } else if (errStr.includes("http_403")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} LLM skipped (403 Forbidden). Often: API key cannot call this model/region, account or quota policy. Read the JSON after http_403 below. If the message mentions rate/flow control, lower Max batch size in the popup.`,
          res.error
        );
      } else if (errStr.includes("http_429")) {
        console.warn(
          `${EXTENSION_LOG_PREFIX} LLM skipped (429 rate limit). Slow down: lower Max batch size in the popup or adjust FLUSH_MS / MAX_CONCURRENT_FLUSHES in llm-batch.ts; wait before retrying.`,
          res.error
        );
      } else if (verboseLogging) {
        console.warn(`${EXTENSION_LOG_PREFIX} LLM batch skipped:`, res.error);
      } else {
        console.debug(`${EXTENSION_LOG_PREFIX} LLM batch skipped:`, res.error);
      }
      for (const [, v] of snapshot) {
        for (const card of v.cards) {
          if (card.isConnected) applyHeuristicFallbackFromPending(card);
        }
      }
      return;
    }

    const byId = new Map(res.results.map((r) => [r.id, r.v]));
    const finalCache: { id: string; v: TierLetter; modelId: string }[] = [];
    for (const [id, v] of snapshot) {
      const letter = byId.get(id);
      if (letter) {
        if (!appliedLlmIds.has(id)) {
          appliedLlmIds.add(id);
          finalCache.push({ id, v: letter, modelId: res.modelId });
          for (const card of v.cards) {
            if (card.isConnected) applyLlmTierToCard(card, letter, res.modelId);
          }
        }
      } else {
        for (const card of v.cards) {
          if (card.isConnected) applyHeuristicFallbackFromPending(card);
        }
      }
    }
    tierCachePutMany(finalCache);
  } finally {
    inFlightFlushes--;
    if (pending.size >= batchMax) {
      void flushQueue();
    } else if (pending.size > 0) {
      scheduleDebounceFlush();
      if (inFlightFlushes < MAX_CONCURRENT_FLUSHES) {
        void flushQueue();
      }
    }
  }
}
