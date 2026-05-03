/**
 * YouTube DOM helpers — selectors may break when YouTube updates the site.
 */

import type { ClassifyBatchItem } from "../shared/messages";

const CARD_SELECTORS = ["ytd-rich-item-renderer", "ytd-video-renderer"] as const;

const TITLE_SELECTORS = [
  "a.ytLockupMetadataViewModelTitle",
  "h3.ytLockupMetadataViewModelHeadingReset a.ytLockupMetadataViewModelTitle",
  "h3.shortsLockupViewModelHostMetadataTitle a",
  "a.shortsLockupViewModelHostOutsideMetadataEndpoint",
  "a#video-title",
  "#video-title",
  "h3 a#video-title",
  "a.yt-simple-endpoint.style-scope.ytd-rich-grid-media",
] as const;

const CHANNEL_SELECTORS = [
  ".ytContentMetadataViewModelMetadataRow a[href*='/@']",
  ".ytContentMetadataViewModelMetadataRow a[href*='/channel/']",
  ".ytContentMetadataViewModelMetadataRow a[href*='/c/']",
  ".ytContentMetadataViewModelMetadataRow a.ytAttributedStringLink",
  "ytd-channel-name yt-formatted-string a",
  "ytd-channel-name a",
  "ytd-channel-name yt-formatted-string",
  "#channel-name a",
  "ytd-channel-name #text",
  "#channel-name yt-formatted-string",
] as const;

const THUMBNAIL_HOST_SELECTORS = [
  "a.ytLockupViewModelContentImage",
  "a.shortsLockupViewModelHostEndpoint.reel-item-endpoint",
  "ytd-thumbnail a#thumbnail",
  "a#thumbnail",
  "ytd-rich-grid-media a#thumbnail",
] as const;

export function queryVideoCards(root: ParentNode = document): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const list: HTMLElement[] = [];
  for (const sel of CARD_SELECTORS) {
    root.querySelectorAll(sel).forEach((node) => {
      if (node instanceof HTMLElement && !seen.has(node)) {
        seen.add(node);
        list.push(node);
      }
    });
  }
  return list;
}

function textFromSelectors(
  el: Element,
  selectors: readonly string[]
): string | null {
  for (const sel of selectors) {
    const node = el.querySelector(sel);
    if (node?.textContent) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      if (t) return t;
    }
  }
  return null;
}

export function getTitle(el: Element): string | null {
  return textFromSelectors(el, TITLE_SELECTORS);
}

export function getChannelName(el: Element): string | null {
  return textFromSelectors(el, CHANNEL_SELECTORS);
}

/** Parse stable id from /watch?v= or /shorts/ links inside the card. */
export function getVideoId(card: Element): string | null {
  const links = card.querySelectorAll("a[href]");
  for (let i = 0; i < links.length; i++) {
    const a = links[i];
    const href = a.getAttribute("href") || "";
    const watch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watch) return watch[1];
    const short = href.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (short) return short[1];
  }
  return null;
}

/** Stable id for batching: real video id, or hash of title+channel. */
export function stableItemKey(
  card: Element,
  title: string,
  channel: string
): string {
  const v = getVideoId(card);
  if (v) return v;
  let h = 5381;
  const s = `${title}\0${channel}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return `h${(h >>> 0).toString(16)}`;
}

/** Full video tile (thumbnail + title row): marker sits bottom-right of this box. */
export function getTileMarkerHost(card: HTMLElement): HTMLElement {
  const inner = card.querySelector("#content");
  if (inner instanceof HTMLElement) {
    ensurePositioned(inner);
    return inner;
  }
  ensurePositioned(card);
  return card;
}

/** Element that wraps the thumbnail only (used to detect a real video tile). */
export function getThumbnailHost(card: Element): HTMLElement | null {
  for (const sel of THUMBNAIL_HOST_SELECTORS) {
    const el = card.querySelector(sel);
    if (el instanceof HTMLElement) {
      ensurePositioned(el);
      return el;
    }
  }
  const vm = card.querySelector("yt-thumbnail-view-model");
  if (vm instanceof HTMLElement) {
    ensurePositioned(vm);
    return vm;
  }
  return null;
}

function ensurePositioned(el: HTMLElement): void {
  const pos = getComputedStyle(el).position;
  if (pos === "static" || pos === "") el.style.position = "relative";
}

export type TileMetaForLlm = {
  duration: string | null;
  views: string | null;
  uploadedAgo: string | null;
  handle: string | null;
  shorts: boolean;
};

/** Whether the card’s primary links target Shorts. */
export function isShortsCard(card: Element): boolean {
  for (const sel of THUMBNAIL_HOST_SELECTORS) {
    const el = card.querySelector(sel);
    const href = el?.getAttribute("href") || "";
    if (href.includes("/shorts/")) return true;
  }
  const a = card.querySelector(
    "a[href*='/shorts/']"
  );
  return !!a;
}

/** Overlay duration on thumbnail (long-form or Shorts when present). */
export function getVideoDurationLabel(card: Element): string | null {
  const nodes = card.querySelectorAll(
    "yt-thumbnail-badge-view-model .ytBadgeShapeText, badge-shape .ytBadgeShapeText"
  );
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const t = node.textContent?.replace(/\s+/g, " ").trim();
    if (t && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t;
  }
  return null;
}

/** @handle from channel link in metadata row, if any. */
export function getChannelHandle(card: Element): string | null {
  const a = card.querySelector(
    '.ytContentMetadataViewModelMetadataRow a[href*="/@"]'
  );
  if (!a) return null;
  const href = a.getAttribute("href") || "";
  const m = href.match(/\/@([^/?#]+)/);
  if (!m) return null;
  try {
    return `@${decodeURIComponent(m[1])}`;
  } catch {
    return `@${m[1]}`;
  }
}

/**
 * Best-effort stats from the visible tile (new lockup + shelf + legacy hints).
 */
export function getTileMetaForLlm(card: Element): TileMetaForLlm {
  const shorts = isShortsCard(card);
  const duration = getVideoDurationLabel(card);
  const handle = getChannelHandle(card);

  let views: string | null = null;
  let uploadedAgo: string | null = null;

  const row =
    card.querySelector(".ytContentMetadataViewModelMetadataRow") ??
    card.querySelector("#metadata-line");

  if (row) {
    const spans = row.querySelectorAll(
      "span.ytContentMetadataViewModelMetadataText[role='text']"
    );
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!text) continue;
      if (aria.includes("view")) views = text;
      else if (
        /\bago\b$/i.test(text) ||
        /^\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i.test(
          aria
        ) ||
        /streamed|premiered/i.test(aria)
      ) {
        uploadedAgo = text;
      }
    }
  }

  if (shorts && !views) {
    const sub = card.querySelector(
      ".shortsLockupViewModelHostOutsideMetadataSubhead span[role='text'], .shortsLockupViewModelHostOutsideMetadataSubhead .ytContentMetadataViewModelMetadataText"
    );
    const t = sub?.textContent?.replace(/\s+/g, " ").trim();
    if (t) views = t;
  }

  if (!views && !uploadedAgo && row && row.textContent) {
    const compact = row.textContent.replace(/\s+/g, " ").trim();
    const parts = compact
      .split("·")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      if (/view/i.test(p) || /^[\d.]+\s*[KMB]?$/i.test(p)) {
        if (!views) views = p;
      } else if (/\bago\b|Streamed|Premiered|Live/i.test(p)) {
        if (!uploadedAgo) uploadedAgo = p;
      }
    }
  }

  return { duration, views, uploadedAgo, handle, shorts };
}

/** Build payload row for the classifier (omits empty optional fields). */
export function buildClassifyBatchItem(
  card: HTMLElement,
  id: string,
  title: string,
  channel: string
): ClassifyBatchItem {
  const meta = getTileMetaForLlm(card);
  const item: ClassifyBatchItem = { id, t: title, c: channel };
  if (meta.duration) item.d = meta.duration;
  if (meta.views) item.vc = meta.views;
  if (meta.uploadedAgo) item.pub = meta.uploadedAgo;
  if (meta.handle) item.h = meta.handle;
  if (meta.shorts) item.short = true;
  return item;
}
