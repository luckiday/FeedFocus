import { classifyHeuristicDetailed, type AttentionTier } from "./heuristics";
import { EXTENSION_LOG_PREFIX, EXTENSION_SHORT_NAME } from "../shared/branding";
import { SETTINGS_STORAGE_KEY } from "../shared/settings";
import {
  attachVerboseLoggingSync,
  logClassification,
} from "./classification-log";
import {
  enqueueCardForLlm,
  loadSettingsSnapshot,
  resetLlmQueue,
} from "./llm-batch";
import { CHECKED_ATTR, HEURISTIC_TIER_KEY, MARKER_CLASS, markerPrefs, paintMarker } from "./markers";
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

let extensionEnabled = true;

/** Mirror settings into the synchronous marker prefs + enabled flag. */
async function syncPrefs(): Promise<void> {
  const s = await loadSettingsSnapshot();
  extensionEnabled = s.enabled;
  markerPrefs.style = s.markerStyle;
  markerPrefs.labels = s.markerLabels;
}

function removeMarkersFromCard(card: Element): void {
  const nodes = card.querySelectorAll(`.${MARKER_CLASS}`);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].remove();
  }
}

async function processCard(card: HTMLElement): Promise<void> {
  if (!extensionEnabled) return;
  if (card.getAttribute(CHECKED_ATTR) === "true") return;

  const thumb = getThumbnailHost(card);
  const title = getTitle(card) ?? "";
  const channel = getChannelName(card) ?? "";

  if (!thumb || (!title && !channel)) return;

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
  dot.className = MARKER_CLASS;
  paintMarker(card, dot, { kind: "pending" });
  dot.title = `${EXTENSION_SHORT_NAME}: waiting for model…`;

  getTileMarkerHost(card).appendChild(dot);

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

function clearAllMarkers(): void {
  resetLlmQueue();
  for (const card of queryVideoCards()) {
    card.removeAttribute(CHECKED_ATTR);
    delete card.dataset.ffVid;
    delete card.dataset[HEURISTIC_TIER_KEY];
    delete card.dataset.ffTier;
    delete card.dataset.ffStyle;
    removeMarkersFromCard(card);
  }
}

function resetCards(): void {
  clearAllMarkers();
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

void syncPrefs().then(() => {
  if (extensionEnabled) scheduleScan();
});
attachObserver();

// Re-render live when the popup changes settings (style/labels/enable).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_STORAGE_KEY]) return;
  void syncPrefs().then(() => {
    if (extensionEnabled) resetCards();
    else clearAllMarkers();
  });
});

window.addEventListener("yt-page-data-updated", scheduleScan);
document.addEventListener("yt-page-data-updated", scheduleScan);
window.addEventListener("yt-navigate-finish", resetCards);
document.addEventListener("yt-navigate-finish", resetCards);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scheduleScan();
});
