export const MSG_CLASSIFY_BATCH = "CLASSIFY_BATCH" as const;

/** Long-lived port for streaming classify deltas (content script ↔ background). */
export const PORT_CLASSIFY_STREAM = "DOPAMINE_CLASSIFY_STREAM" as const;

export type TierLetter = "G" | "Y" | "R";

export type ClassifyBatchItem = {
  id: string;
  t: string;
  c: string;
  /** Thumbnail duration label, e.g. "21:56" or "1:00:14" */
  d?: string;
  /** View count as shown, e.g. "685K" */
  vc?: string;
  /** Upload / freshness text, e.g. "1y ago" */
  pub?: string;
  /** Channel @handle from URL when present */
  h?: string;
  /** True when the primary link is Shorts */
  short?: boolean;
};

export type ClassifyBatchOk = {
  ok: true;
  results: { id: string; v: TierLetter }[];
  modelId: string;
};

export type ClassifyBatchErr = {
  ok: false;
  error: string;
};

export type ClassifyBatchResponse = ClassifyBatchOk | ClassifyBatchErr;

export type ClassifyStreamPortClientMsg = {
  items: ClassifyBatchItem[];
};

export type ClassifyStreamPortServerMsg =
  | {
      type: "partial";
      results: { id: string; v: TierLetter }[];
      modelId: string;
    }
  | { type: "final"; response: ClassifyBatchResponse };

export type ClassifyBatchMessage = {
  type: typeof MSG_CLASSIFY_BATCH;
  items: ClassifyBatchItem[];
};
