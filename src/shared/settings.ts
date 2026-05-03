export const SETTINGS_STORAGE_KEY = "feedFocusYoutubeSettings" as const;

/** LLM queue: max distinct videos per Ark request (clamped in `clampBatchMax`). */
export const BATCH_MAX_MIN = 1;
export const BATCH_MAX_MAX = 50;
export const DEFAULT_BATCH_MAX = 10;

export function clampBatchMax(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BATCH_MAX;
  return Math.min(BATCH_MAX_MAX, Math.max(BATCH_MAX_MIN, Math.floor(n)));
}

/** Normalize API base URL for comparisons (trim trailing slashes). */
export function trimApiBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Injected by esbuild from `.env` beside manifest (see `esbuild.config.mjs`). */
declare const __ENV_ARK_API_KEY__: string;
declare const __ENV_DASHSCOPE_API_KEY__: string;

const ARK_KEY = __ENV_ARK_API_KEY__;
const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DASHSCOPE_KEY = __ENV_DASHSCOPE_API_KEY__;
const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** Returns the correct API key and base URL for a given model ID. */
export function resolveProviderForModel(modelId: string): { key: string; baseUrl: string } {
  if (modelId.startsWith("doubao") || modelId.startsWith("ep-")) {
    return { key: ARK_KEY, baseUrl: ARK_BASE_URL };
  }
  return { key: DASHSCOPE_KEY, baseUrl: DASHSCOPE_BASE_URL };
}

export type FeedFocusSettings = {
  modelId: string;
  /** Max videos per classify request (1–50). */
  batchMax: number;
  /** When true, content script logs each classification to the tab console. */
  verboseLogging: boolean;
};

export const DEFAULT_SETTINGS: FeedFocusSettings = {
  modelId: "qwen-turbo",
  batchMax: DEFAULT_BATCH_MAX,
  verboseLogging: false,
};

export const MODEL_PRESETS: { id: string; label: string }[] = [
  { id: "qwen-turbo", label: "Qwen Turbo (Aliyun DashScope)" },
  { id: "qwen-plus", label: "Qwen Plus (Aliyun DashScope)" },
  { id: "qwen-flash", label: "Qwen Flash (Aliyun DashScope)" },
  { id: "doubao-seed-2-0-mini-260215", label: "Doubao Seed 2.0 Mini (Volcengine Ark)" },
];
