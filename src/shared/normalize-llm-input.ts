import type { ClassifyBatchItem } from "./messages";

/** Zero-width / BOM / word joiner — often appear in scraped UI text and confuse tokenization. */
const INVISIBLE_CHARS =
  /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u061C\u200E\u200F]/g;

/** Explicit bidirectional embedding marks from copy-paste or RTL UI. */
const BIDI_EMBEDS = /[\u202A-\u202E]/g;

const DURATION_LABEL = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Normalize text scraped from YouTube tiles before sending to the classifier.
 * - Unicode NFKC (fullwidth digits/punct ↔ ASCII where applicable)
 * - Strip invisible / bidi control characters
 * - Collapse whitespace
 */
export function normalizeLlmText(raw: string): string {
  let s = raw.normalize("NFKC");
  s = s.replace(INVISIBLE_CHARS, "").replace(BIDI_EMBEDS, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function normalizeVideoItemId(raw: string): string {
  const t = normalizeLlmText(raw).replace(/\s+/g, "");
  return t;
}

/**
 * Produce a stable `ClassifyBatchItem` for the model: same logical tile → same JSON shape
 * (drops empty optionals after normalization).
 */
export function normalizeClassifyBatchItem(
  item: ClassifyBatchItem
): ClassifyBatchItem {
  const id = normalizeVideoItemId(item.id);
  const t = normalizeLlmText(item.t);
  const c = normalizeLlmText(item.c);
  const out: ClassifyBatchItem = { id, t, c };

  if (item.d) {
    const d = normalizeLlmText(item.d);
    if (DURATION_LABEL.test(d)) out.d = d;
  }
  if (item.vc) {
    const vc = normalizeLlmText(item.vc);
    if (vc) out.vc = vc;
  }
  if (item.pub) {
    const pub = normalizeLlmText(item.pub);
    if (pub) out.pub = pub;
  }
  if (item.h) {
    const h = normalizeLlmText(item.h);
    const bare = h.replace(/^@+/, "").trim();
    if (bare) out.h = `@${bare}`;
  }
  if (item.short === true) out.short = true;

  return out;
}

export function normalizeClassifyBatchItems(
  items: ClassifyBatchItem[]
): ClassifyBatchItem[] {
  return items.map(normalizeClassifyBatchItem);
}
