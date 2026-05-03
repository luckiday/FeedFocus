import type { TierLetter } from "./messages";
import { EXTENSION_LOG_PREFIX } from "./branding";

export const TIER_CACHE_STORAGE_KEY = "feedFocusYoutubeTierCache" as const;

export type TierCacheEntry = {
  v: TierLetter;
  /** Model id that produced this tier (for tooltips). */
  m: string;
  /** Last update time (ms). */
  t: number;
};

type TierCacheBlob = { e: Record<string, TierCacheEntry> };

const MAX_ENTRIES = 2000;

let localEntries: Record<string, TierCacheEntry> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function isTier(v: unknown): v is TierLetter {
  return v === "G" || v === "Y" || v === "R";
}

async function ensureLocal(): Promise<Record<string, TierCacheEntry>> {
  if (localEntries) return localEntries;
  const raw = await chrome.storage.local.get(TIER_CACHE_STORAGE_KEY);
  const blob = raw[TIER_CACHE_STORAGE_KEY] as TierCacheBlob | undefined;
  localEntries = blob?.e && typeof blob.e === "object" ? { ...blob.e } : {};
  return localEntries;
}

export async function tierCacheGet(id: string): Promise<TierCacheEntry | null> {
  const e = await ensureLocal();
  const row = e[id];
  if (!row || !isTier(row.v)) return null;
  return row;
}

export function tierCachePutMany(
  rows: { id: string; v: TierLetter; modelId: string }[]
): void {
  if (rows.length === 0) return;
  writeChain = writeChain
    .then(async () => {
      const raw = await chrome.storage.local.get(TIER_CACHE_STORAGE_KEY);
      const prev = (raw[TIER_CACHE_STORAGE_KEY] as TierCacheBlob | undefined)?.e;
      const e: Record<string, TierCacheEntry> =
        prev && typeof prev === "object" ? { ...prev } : {};
      const now = Date.now();
      for (const r of rows) {
        e[r.id] = { v: r.v, m: r.modelId, t: now };
      }
      const keys = Object.keys(e);
      if (keys.length > MAX_ENTRIES) {
        const scored = keys.map((k) => ({ k, t: e[k].t }));
        scored.sort((a, b) => a.t - b.t);
        const drop = keys.length - MAX_ENTRIES;
        for (let i = 0; i < drop; i++) delete e[scored[i].k];
      }
      localEntries = e;
      await chrome.storage.local.set({
        [TIER_CACHE_STORAGE_KEY]: { e } satisfies TierCacheBlob,
      });
    })
    .catch((err) => {
      console.warn(`${EXTENSION_LOG_PREFIX} tier cache write failed`, err);
    });
}
