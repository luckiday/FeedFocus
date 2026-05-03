/** Shared DOM marker / scan attributes for content scripts */

export const MARKER_CLASS = "ff-focus-marker";
export const CHECKED_ATTR = "data-ff-focus-checked";
/** `card.dataset[HEURISTIC_TIER_KEY]` stores G|Y|R for tooltips / logs only (never shown as dot color). */
export const HEURISTIC_TIER_KEY = "ffFocusHeuristicTier";
/** Solid gray dot: heuristics ran; colored G/Y/R comes only from the model. */
export const MARKER_HEURISTIC_CLASS = `${MARKER_CLASS}--heuristic`;
