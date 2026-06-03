import {
  ARK_BASE_URL,
  clampBatchMax,
  coerceKeyMode,
  coerceMarkerStyle,
  coerceProvider,
  DASHSCOPE_BASE_URL,
  DEFAULT_SETTINGS,
  hydrateSettings,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
  type KeyMode,
  type MarkerStyle,
  type ProviderId,
} from "../shared/settings";
import { MSG_TEST_KEY, type TestKeyResponse } from "../shared/messages";

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

async function loadSettings(): Promise<FeedFocusSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return hydrateSettings(raw[SETTINGS_STORAGE_KEY] as Partial<FeedFocusSettings> | undefined);
}

async function saveSettings(s: FeedFocusSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: s });
}

const PROVIDER_DEFAULT_MODEL: Record<ProviderId, string> = {
  dashscope: "qwen-turbo",
  ark: "doubao-seed-2-0-mini-260428",
  openai: "gpt-4o-mini",
};

/** Friendlier one-liners for the Test-key result. */
function friendlyTestError(error: string | undefined): string {
  const e = error ?? "unknown error";
  if (e.startsWith("no_api_key")) return "No key entered.";
  if (e.includes("no_base_url")) return "Enter a Base URL first.";
  if (e.includes("http_401")) return "Invalid or expired key (401).";
  if (e.includes("http_403")) return "Key can't access this model (403).";
  if (e.includes("http_404")) return "Not found (404) — check the Base URL / model id.";
  if (e.includes("http_429")) return "Rate limited (429) — key is valid, try later.";
  return e;
}

async function init(): Promise<void> {
  const form = $("settings-form") as HTMLFormElement;
  const statusEl = $("status");
  const verboseLoggingInput = $("verbose-logging") as HTMLInputElement;
  const batchMaxInput = $("batch-max") as HTMLInputElement;
  const dashscopeKeyInput = $("dashscope-key") as HTMLInputElement;
  const arkKeyInput = $("ark-key") as HTMLInputElement;
  const openaiKeyInput = $("openai-key") as HTMLInputElement;
  const openaiBaseInput = $("openai-base") as HTMLInputElement;
  const showKeysInput = $("show-keys") as HTMLInputElement;
  const enabledInput = $("enabled") as HTMLInputElement;
  const markerLabelsInput = $("marker-labels") as HTMLInputElement;
  const testBtn = $("test-key") as HTMLButtonElement;
  const testStatus = $("test-status");
  const sectionKeys = $("section-keys");
  const sectionModel = $("section-model");
  const providerSelect = $("provider-select") as HTMLSelectElement;
  const modelInput = $("model-id") as HTMLInputElement;
  const blocks: Record<ProviderId, HTMLElement> = {
    dashscope: $("block-dashscope"),
    ark: $("block-ark"),
    openai: $("block-openai"),
  };

  const getKeyMode = (): KeyMode => {
    const checked = form.querySelector<HTMLInputElement>('input[name="keyMode"]:checked');
    return coerceKeyMode(checked?.value);
  };
  const applyModeVisibility = (): void => {
    const own = getKeyMode() === "own";
    sectionKeys.hidden = !own;
    sectionModel.hidden = !own;
  };

  const getProvider = (): ProviderId => coerceProvider(providerSelect.value);
  const applyProviderVisibility = (): void => {
    const p = getProvider();
    blocks.dashscope.hidden = p !== "dashscope";
    blocks.ark.hidden = p !== "ark";
    blocks.openai.hidden = p !== "openai";
  };

  const currentModelId = (): string => modelInput.value.trim() || DEFAULT_SETTINGS.modelId;

  /**
   * Custom OpenAI-compatible hosts aren't in manifest host_permissions, so we
   * request them on demand (this popup click is a valid user gesture).
   * The fixed providers (DashScope / Ark) are already granted.
   */
  const ensureHostPermission = async (baseUrl: string): Promise<boolean> => {
    if (getProvider() !== "openai") return true;
    try {
      const origin = `${new URL(baseUrl).origin}/*`;
      if (await chrome.permissions.contains({ origins: [origin] })) return true;
      return await chrome.permissions.request({ origins: [origin] });
    } catch {
      return false;
    }
  };

  /** Base URL + key for the currently selected provider. */
  const currentEndpoint = (): { baseUrl: string; key: string } => {
    switch (getProvider()) {
      case "ark":
        return { baseUrl: ARK_BASE_URL, key: arkKeyInput.value.trim() };
      case "openai":
        return { baseUrl: openaiBaseInput.value.trim(), key: openaiKeyInput.value.trim() };
      default:
        return { baseUrl: DASHSCOPE_BASE_URL, key: dashscopeKeyInput.value.trim() };
    }
  };

  const getMarkerStyle = (): MarkerStyle => {
    const checked = form.querySelector<HTMLInputElement>('input[name="markerStyle"]:checked');
    return coerceMarkerStyle(checked?.value);
  };
  const setMarkerStyle = (style: MarkerStyle): void => {
    const el = form.querySelector<HTMLInputElement>(
      `input[name="markerStyle"][value="${style}"]`
    );
    if (el) el.checked = true;
  };

  const settings = await loadSettings();

  // Access mode
  const modeRadio = form.querySelector<HTMLInputElement>(
    `input[name="keyMode"][value="${settings.keyMode}"]`
  );
  if (modeRadio) modeRadio.checked = true;
  applyModeVisibility();
  form
    .querySelectorAll<HTMLInputElement>('input[name="keyMode"]')
    .forEach((r) => r.addEventListener("change", applyModeVisibility));

  // Provider + keys
  providerSelect.value = settings.provider;
  applyProviderVisibility();
  dashscopeKeyInput.value = settings.dashscopeApiKey;
  arkKeyInput.value = settings.arkApiKey;
  openaiKeyInput.value = settings.openaiApiKey;
  openaiBaseInput.value = settings.openaiBaseUrl;
  modelInput.value = settings.modelId;

  providerSelect.addEventListener("change", () => {
    applyProviderVisibility();
    if (!modelInput.value.trim()) modelInput.value = PROVIDER_DEFAULT_MODEL[getProvider()];
  });

  // OpenAI-compatible quick-fill presets
  $("openai-presets")
    .querySelectorAll<HTMLButtonElement>("button[data-base]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        openaiBaseInput.value = btn.dataset.base ?? "";
        if (btn.dataset.model) modelInput.value = btn.dataset.model;
      });
    });

  // Display + advanced
  enabledInput.checked = settings.enabled;
  markerLabelsInput.checked = settings.markerLabels;
  setMarkerStyle(settings.markerStyle);
  verboseLoggingInput.checked = settings.verboseLogging;
  batchMaxInput.value = String(settings.batchMax);

  showKeysInput.addEventListener("change", () => {
    const type = showKeysInput.checked ? "text" : "password";
    dashscopeKeyInput.type = type;
    arkKeyInput.type = type;
    openaiKeyInput.type = type;
  });

  testBtn.addEventListener("click", async () => {
    const { baseUrl, key } = currentEndpoint();
    if (!key) {
      testStatus.textContent = "Enter an API key first.";
      return;
    }
    if (!baseUrl) {
      testStatus.textContent = "Enter a Base URL first.";
      return;
    }
    if (!(await ensureHostPermission(baseUrl))) {
      testStatus.textContent = "✗ Permission to reach that host was denied.";
      return;
    }
    testStatus.textContent = "Testing…";
    testBtn.disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: MSG_TEST_KEY,
        baseUrl,
        modelId: currentModelId(),
        key,
      })) as TestKeyResponse | undefined;
      testStatus.textContent = res?.ok
        ? `✓ Works with ${res.modelId}.`
        : `✗ ${friendlyTestError(res?.error)}`;
    } catch {
      testStatus.textContent = "✗ Could not reach the extension worker. Reload the extension.";
    } finally {
      testBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "";

    const next: FeedFocusSettings = {
      keyMode: getKeyMode(),
      provider: getProvider(),
      modelId: currentModelId(),
      dashscopeApiKey: dashscopeKeyInput.value.trim(),
      arkApiKey: arkKeyInput.value.trim(),
      openaiApiKey: openaiKeyInput.value.trim(),
      openaiBaseUrl: openaiBaseInput.value.trim(),
      enabled: enabledInput.checked,
      markerStyle: getMarkerStyle(),
      markerLabels: markerLabelsInput.checked,
      batchMax: clampBatchMax(
        batchMaxInput.value === "" ? DEFAULT_SETTINGS.batchMax : Number(batchMaxInput.value)
      ),
      verboseLogging: verboseLoggingInput.checked,
    };

    batchMaxInput.value = String(next.batchMax);
    modelInput.value = next.modelId;

    const needsPermission =
      next.keyMode === "own" && next.provider === "openai" && !!next.openaiBaseUrl;
    const permissionDenied = needsPermission && !(await ensureHostPermission(next.openaiBaseUrl));

    try {
      await saveSettings(next);
      const { baseUrl, key } = currentEndpoint();
      const missing = next.keyMode === "own" && (!key || !baseUrl);
      statusEl.textContent = !next.enabled
        ? "Saved — extension is turned off."
        : permissionDenied
          ? "Saved — but access to that host was denied, so it can't run."
          : missing
            ? "Saved — but this provider needs a key (and Base URL) to run."
            : "Saved.";
    } catch {
      statusEl.textContent = "Could not save. Check extension permissions.";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init().catch(() => {
    const s = document.getElementById("status");
    if (s) s.textContent = "Failed to load settings.";
  });
});
