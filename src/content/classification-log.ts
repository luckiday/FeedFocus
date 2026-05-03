import type { AttentionTier } from "./heuristics";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
} from "../shared/settings";
import { EXTENSION_LOG_PREFIX, EXTENSION_SHORT_NAME } from "../shared/branding";

/** In-memory cache; updated on load and storage.onChanged */
let verboseLogging = DEFAULT_SETTINGS.verboseLogging;
let classificationHintShown = false;

function maybeShowConsoleHint(): void {
  if (!verboseLogging || classificationHintShown) return;
  classificationHintShown = true;
  console.info(
    `${EXTENSION_LOG_PREFIX} verbose logging on — open DevTools → Console on this tab and filter for "${EXTENSION_SHORT_NAME}".`
  );
}

function refreshFromStorage(): void {
  chrome.storage.local.get(SETTINGS_STORAGE_KEY, (raw) => {
    const s = raw[SETTINGS_STORAGE_KEY] as FeedFocusSettings | undefined;
    const prev = verboseLogging;
    verboseLogging =
      typeof s?.verboseLogging === "boolean"
        ? s.verboseLogging
        : DEFAULT_SETTINGS.verboseLogging;
    if (!prev && verboseLogging) classificationHintShown = false;
    maybeShowConsoleHint();
  });
}

export function attachVerboseLoggingSync(): void {
  refreshFromStorage();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const ch = changes[SETTINGS_STORAGE_KEY];
    if (!ch?.newValue) return;
    const nv = ch.newValue as FeedFocusSettings;
    const prev = verboseLogging;
    if (typeof nv.verboseLogging === "boolean") {
      verboseLogging = nv.verboseLogging;
    }
    if (!prev && verboseLogging) classificationHintShown = false;
    maybeShowConsoleHint();
  });
}

export type ClassificationLogPayload = {
  method: "rule" | "llm" | "llm_cached";
  videoId: string | null;
  title: string;
  channel: string;
  tier: AttentionTier;
  /** Rule traces; LLM path can add model id / parse notes later */
  detail?: string[];
  modelId?: string;
};

export function logClassification(entry: ClassificationLogPayload): void {
  if (!verboseLogging) return;
  const row = {
    ...entry,
    ts: new Date().toISOString(),
  };
  console.info(`${EXTENSION_LOG_PREFIX} classification`, row);
}
