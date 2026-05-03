import { classifyHeuristicDetailed, type AttentionTier } from "./heuristics";
import { EXTENSION_LOG_PREFIX, EXTENSION_SHORT_NAME } from "../shared/branding";
import {
  attachVerboseLoggingSync,
  logClassification,
} from "./classification-log";
import {
  enqueueCardForLlm,
  resetLlmQueue,
} from "./llm-batch";
import { CHECKED_ATTR, HEURISTIC_TIER_KEY, MARKER_CLASS, MARKER_HEURISTIC_CLASS } from "./markers";
import {
  buildClassifyBatchItem,
  getChannelName,
  getThumbnailHost,
  getTileMarkerHost,
  getTitle,
  getVideoId,
  queryVideoCards,
  stableItemKey,
} from "./yt-dom";

function removeMarkersFromCard(card: Element): void {
  const nodes = card.querySelectorAll(`.${MARKER_CLASS}`);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].remove();
  }
}

async function processCard(card: HTMLElement): Promise<void> {
  if (card.getAttribute(CHECKED_ATTR) === "true") return;

  const thumb = getThumbnailHost(card);
  const title = getTitle(card) ?? "";
  const channel = getChannelName(card) ?? "";

  if (!thumb || (!title && !channel)) return;

  const markerHost = getTileMarkerHost(card);
  card.setAttribute(CHECKED_ATTR, "true");

  removeMarkersFromCard(card);

  const rule = classifyHeuristicDetailed(title, channel);
  const tier: AttentionTier = rule.tier;
  const videoId = getVideoId(card);
  const itemId = stableItemKey(card, title, channel);
  card.dataset.ffVid = itemId;
  card.dataset[HEURISTIC_TIER_KEY] = tier;

  logClassification({
    method: "rule",
    videoId,
    title,
    channel,
    tier,
    detail: [...rule.reasons, "visual:pending_until_llm"],
  });

  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  dot.className = `${MARKER_CLASS} ${MARKER_CLASS}--pending`;
  dot.title = `${EXTENSION_SHORT_NAME}: waiting for model…`;

  markerHost.appendChild(dot);

  void enqueueCardForLlm(card, buildClassifyBatchItem(card, itemId, title, channel));
}

let scheduled: ReturnType<typeof setTimeout> | null = null;

function scheduleScan(): void {
  if (scheduled !== null) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    try {
      for (const card of queryVideoCards()) {
        void processCard(card).catch((err) => {
          console.error(`${EXTENSION_LOG_PREFIX} processCard error`, err);
        });
      }
    } catch (e) {
      console.error(`${EXTENSION_LOG_PREFIX} scan error`, e);
    }
  }, 120);
}

function resetCards(): void {
  resetLlmQueue();
  for (const card of queryVideoCards()) {
    card.removeAttribute(CHECKED_ATTR);
    delete card.dataset.ffVid;
    delete card.dataset[HEURISTIC_TIER_KEY];
    removeMarkersFromCard(card);
  }
  scheduleScan();
}

function attachObserver(): void {
  const target = document.querySelector("ytd-app") ?? document.body;
  new MutationObserver(() => scheduleScan()).observe(target, {
    childList: true,
    subtree: true,
  });
}

attachVerboseLoggingSync();

scheduleScan();
attachObserver();

window.addEventListener("yt-page-data-updated", scheduleScan);
document.addEventListener("yt-page-data-updated", scheduleScan);
window.addEventListener("yt-navigate-finish", resetCards);
document.addEventListener("yt-navigate-finish", resetCards);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleScan();
});
