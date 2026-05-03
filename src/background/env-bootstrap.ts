import {
  clampBatchMax,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
} from "../shared/settings";

type ParsedEnv = Record<string, string>;

function parseEnvText(text: string): ParsedEnv {
  const out: ParsedEnv = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

type SettingsPatch = Partial<FeedFocusSettings>;

function envToSettingsPatch(env: ParsedEnv): SettingsPatch {
  const patch: SettingsPatch = {};

  const model = env.MODEL_ID || env.MODEL || env.DASHSCOPE_MODEL;
  if (model?.trim()) patch.modelId = model.trim();

  if (env.BATCH_MAX?.trim()) {
    patch.batchMax = clampBatchMax(Number(env.BATCH_MAX));
  }

  if (env.VERBOSE_LOGGING === "1" || /^true$/i.test(env.VERBOSE_LOGGING ?? "")) {
    patch.verboseLogging = true;
  }

  return patch;
}

function hydrate(cur: Partial<FeedFocusSettings> | undefined): FeedFocusSettings {
  return {
    modelId:
      typeof cur?.modelId === "string" ? cur.modelId : DEFAULT_SETTINGS.modelId,
    batchMax: clampBatchMax(cur?.batchMax ?? DEFAULT_SETTINGS.batchMax),
    verboseLogging:
      typeof cur?.verboseLogging === "boolean"
        ? cur.verboseLogging
        : DEFAULT_SETTINGS.verboseLogging,
  };
}

export async function bootstrapSettingsFromBundledEnv(
  reason: chrome.runtime.OnInstalledReason
): Promise<void> {
  let text: string;
  try {
    const url = chrome.runtime.getURL(".env");
    const res = await fetch(url);
    if (!res.ok) return;
    text = await res.text();
  } catch {
    return;
  }

  const patch = envToSettingsPatch(parseEnvText(text));
  if (
    patch.modelId === undefined &&
    patch.batchMax === undefined &&
    patch.verboseLogging === undefined
  ) {
    return;
  }

  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const cur = raw[SETTINGS_STORAGE_KEY] as Partial<FeedFocusSettings> | undefined;
  const merged = hydrate(cur);
  const overwrite = reason === chrome.runtime.OnInstalledReason.INSTALL;

  if (patch.modelId !== undefined && (overwrite || !merged.modelId))
    merged.modelId = patch.modelId;
  if (patch.batchMax !== undefined && (overwrite || merged.batchMax === DEFAULT_SETTINGS.batchMax))
    merged.batchMax = patch.batchMax;
  if (patch.verboseLogging !== undefined && (overwrite || !merged.verboseLogging))
    merged.verboseLogging = patch.verboseLogging;

  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: merged });
}
