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

export const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** dashscope = Aliyun Qwen, ark = Volcengine Doubao, openai = any OpenAI-compatible endpoint. */
export type ProviderId = "dashscope" | "ark" | "openai";

export function coerceProvider(value: unknown): ProviderId {
  return value === "ark" || value === "openai" ? value : "dashscope";
}

/** Heuristic used only to pick a default provider for users upgrading from the old prefix-based scheme. */
function defaultProviderForModel(modelId: string): ProviderId {
  return modelId.startsWith("doubao") || modelId.startsWith("ep-") ? "ark" : "dashscope";
}

/** One-click presets for the generic OpenAI-compatible provider. */
export const OPENAI_COMPAT_PRESETS: {
  id: string;
  label: string;
  baseUrl: string;
  modelHint: string;
}[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", modelHint: "gpt-4o-mini" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", modelHint: "deepseek-chat" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", modelHint: "anthropic/claude-3.5-haiku" },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelHint: "gemini-2.0-flash",
  },
];

/**
 * Resolve the active provider's key + base URL from user settings. Keys are
 * entered in the popup and stored in `chrome.storage.local`; nothing is bundled.
 */
export function resolveProvider(settings: FeedFocusSettings): {
  provider: ProviderId;
  key: string;
  baseUrl: string;
} {
  switch (settings.provider) {
    case "ark":
      return { provider: "ark", key: settings.arkApiKey.trim(), baseUrl: ARK_BASE_URL };
    case "openai":
      return {
        provider: "openai",
        key: settings.openaiApiKey.trim(),
        baseUrl: trimApiBaseUrl(settings.openaiBaseUrl.trim()),
      };
    case "dashscope":
    default:
      return {
        provider: "dashscope",
        key: settings.dashscopeApiKey.trim(),
        baseUrl: DASHSCOPE_BASE_URL,
      };
  }
}

/** How tier results are emphasized on the feed. */
export type MarkerStyle = "dot" | "border" | "dim";
export const MARKER_STYLES: { id: MarkerStyle; label: string }[] = [
  { id: "dot", label: "Corner dot" },
  { id: "border", label: "Tile border" },
  { id: "dim", label: "Dim red tiles" },
];

export function coerceMarkerStyle(value: unknown): MarkerStyle {
  return value === "border" || value === "dim" ? value : "dot";
}

/** Where classification requests are sent. */
export type KeyMode = "free" | "own";

export function coerceKeyMode(value: unknown): KeyMode {
  return value === "own" ? "own" : "free";
}

export type FeedFocusSettings = {
  /** "free": route through the shared proxy. "own": call the provider with the user's key. */
  keyMode: KeyMode;
  /** Which provider Own-key mode calls. */
  provider: ProviderId;
  modelId: string;
  /** Aliyun DashScope API key (`sk-…`). Used for Qwen models. */
  dashscopeApiKey: string;
  /** Volcengine Ark API key. Used for Doubao / `ep-…` models. */
  arkApiKey: string;
  /** API key for the generic OpenAI-compatible provider. */
  openaiApiKey: string;
  /** Base URL for the generic OpenAI-compatible provider (before `/chat/completions`). */
  openaiBaseUrl: string;
  /** Master switch: when false, no markers are drawn and no requests are made. */
  enabled: boolean;
  /** How tier results are emphasized on the feed. */
  markerStyle: MarkerStyle;
  /** When true, colored markers show their G/Y/R letter (colorblind-safe). */
  markerLabels: boolean;
  /** Max videos per classify request (1–50). */
  batchMax: number;
  /** When true, content script logs each classification to the tab console. */
  verboseLogging: boolean;
};

export const DEFAULT_SETTINGS: FeedFocusSettings = {
  keyMode: "free",
  provider: "dashscope",
  modelId: "qwen-turbo",
  dashscopeApiKey: "",
  arkApiKey: "",
  openaiApiKey: "",
  openaiBaseUrl: "",
  enabled: true,
  markerStyle: "dot",
  markerLabels: false,
  batchMax: DEFAULT_BATCH_MAX,
  verboseLogging: false,
};

export const MODEL_PRESETS: { id: string; label: string }[] = [
  { id: "qwen-turbo", label: "Qwen Turbo (Aliyun DashScope)" },
  { id: "qwen3.6-plus", label: "Qwen Plus (Aliyun DashScope)" },
  { id: "qwen3.5-flash", label: "Qwen Flash (Aliyun DashScope)" },
  { id: "doubao-seed-2-0-mini-260428", label: "Doubao Seed 2.0 Mini (Volcengine Ark)" },
];

/** Old model IDs → new canonical IDs (survives across preset renames). */
const MODEL_ID_MIGRATIONS: Record<string, string> = {
  "qwen-plus": "qwen3.6-plus",
  "qwen-flash": "qwen3.5-flash",
  "doubao-seed-2-0-mini-260215": "doubao-seed-2-0-mini-260428",
};

export function migrateModelId(id: string): string {
  return MODEL_ID_MIGRATIONS[id] ?? id;
}

/** Hydrate raw storage data into a fully-typed FeedFocusSettings, applying any model ID migrations. */
export function hydrateSettings(raw: Partial<FeedFocusSettings> | undefined): FeedFocusSettings {
  const modelId = migrateModelId(
    typeof raw?.modelId === "string" ? raw.modelId : DEFAULT_SETTINGS.modelId
  );
  return {
    keyMode: coerceKeyMode(raw?.keyMode),
    // Pre-provider installs: derive from the old model-prefix scheme.
    provider:
      raw?.provider === undefined ? defaultProviderForModel(modelId) : coerceProvider(raw.provider),
    modelId,
    dashscopeApiKey:
      typeof raw?.dashscopeApiKey === "string"
        ? raw.dashscopeApiKey
        : DEFAULT_SETTINGS.dashscopeApiKey,
    arkApiKey:
      typeof raw?.arkApiKey === "string"
        ? raw.arkApiKey
        : DEFAULT_SETTINGS.arkApiKey,
    openaiApiKey:
      typeof raw?.openaiApiKey === "string"
        ? raw.openaiApiKey
        : DEFAULT_SETTINGS.openaiApiKey,
    openaiBaseUrl:
      typeof raw?.openaiBaseUrl === "string"
        ? raw.openaiBaseUrl
        : DEFAULT_SETTINGS.openaiBaseUrl,
    enabled:
      typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
    markerStyle: coerceMarkerStyle(raw?.markerStyle),
    markerLabels:
      typeof raw?.markerLabels === "boolean"
        ? raw.markerLabels
        : DEFAULT_SETTINGS.markerLabels,
    batchMax: clampBatchMax(raw?.batchMax ?? DEFAULT_SETTINGS.batchMax),
    verboseLogging:
      typeof raw?.verboseLogging === "boolean"
        ? raw.verboseLogging
        : DEFAULT_SETTINGS.verboseLogging,
  };
}
