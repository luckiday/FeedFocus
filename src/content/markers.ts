/** Shared DOM marker / scan attributes + rendering for content scripts */

import type { MarkerStyle } from "../shared/settings";
import type { TierLetter } from "../shared/messages";

export const MARKER_CLASS = "ff-focus-marker";
export const CHECKED_ATTR = "data-ff-focus-checked";
/** `card.dataset[HEURISTIC_TIER_KEY]` stores G|Y|R for tooltips / logs only (never shown as dot color). */
export const HEURISTIC_TIER_KEY = "ffFocusHeuristicTier";
/** Solid gray dot: heuristics ran; colored G/Y/R comes only from the model. */
export const MARKER_HEURISTIC_CLASS = `${MARKER_CLASS}--heuristic`;

/**
 * Live marker preferences, mirrored from settings by the content script so the
 * paint helpers stay synchronous. Updated on load and on storage changes.
 */
export const markerPrefs: { style: MarkerStyle; labels: boolean } = {
  style: "dot",
  labels: true,
};

type MarkerState =
  | { kind: "pending" }
  | { kind: "heuristic" }
  | { kind: "tier"; tier: TierLetter };

/**
 * Apply a marker state to a card's dot and tile. Handles the G/Y/R letter
 * label and the border/dim tile decoration via `data-ff-*` attributes (styled
 * in youtube-home.css). `card` is the tile element; `dot` is the marker span.
 */
export function paintMarker(
  card: HTMLElement,
  dot: HTMLElement,
  state: MarkerState
): void {
  dot.classList.remove(
    `${MARKER_CLASS}--pending`,
    `${MARKER_CLASS}--G`,
    `${MARKER_CLASS}--Y`,
    `${MARKER_CLASS}--R`,
    MARKER_HEURISTIC_CLASS
  );

  if (state.kind === "tier") {
    dot.classList.add(`${MARKER_CLASS}--${state.tier}`);
    dot.textContent = markerPrefs.labels ? state.tier : "";
    card.dataset.ffStyle = markerPrefs.style;
    card.dataset.ffTier = state.tier;
  } else {
    dot.textContent = "";
    dot.classList.add(
      state.kind === "heuristic" ? MARKER_HEURISTIC_CLASS : `${MARKER_CLASS}--pending`
    );
    delete card.dataset.ffTier;
    delete card.dataset.ffStyle;
  }
}
