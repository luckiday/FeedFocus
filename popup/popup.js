"use strict";
(() => {
  // src/shared/settings.ts
  var SETTINGS_STORAGE_KEY = "feedFocusYoutubeSettings";
  var BATCH_MAX_MIN = 1;
  var BATCH_MAX_MAX = 50;
  var DEFAULT_BATCH_MAX = 10;
  function clampBatchMax(value) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return DEFAULT_BATCH_MAX;
    return Math.min(BATCH_MAX_MAX, Math.max(BATCH_MAX_MIN, Math.floor(n)));
  }
  var ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
  var DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  function coerceProvider(value) {
    return value === "ark" || value === "openai" ? value : "dashscope";
  }
  function defaultProviderForModel(modelId) {
    return modelId.startsWith("doubao") || modelId.startsWith("ep-") ? "ark" : "dashscope";
  }
  function coerceMarkerStyle(value) {
    return value === "border" || value === "dim" ? value : "dot";
  }
  function coerceKeyMode(value) {
    return value === "own" ? "own" : "free";
  }
  var DEFAULT_SETTINGS = {
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
    verboseLogging: false
  };
  var MODEL_ID_MIGRATIONS = {
    "qwen-plus": "qwen3.6-plus",
    "qwen-flash": "qwen3.5-flash",
    "doubao-seed-2-0-mini-260215": "doubao-seed-2-0-mini-260428"
  };
  function migrateModelId(id) {
    return MODEL_ID_MIGRATIONS[id] ?? id;
  }
  function hydrateSettings(raw) {
    const modelId = migrateModelId(
      typeof raw?.modelId === "string" ? raw.modelId : DEFAULT_SETTINGS.modelId
    );
    return {
      keyMode: coerceKeyMode(raw?.keyMode),
      // Pre-provider installs: derive from the old model-prefix scheme.
      provider: raw?.provider === void 0 ? defaultProviderForModel(modelId) : coerceProvider(raw.provider),
      modelId,
      dashscopeApiKey: typeof raw?.dashscopeApiKey === "string" ? raw.dashscopeApiKey : DEFAULT_SETTINGS.dashscopeApiKey,
      arkApiKey: typeof raw?.arkApiKey === "string" ? raw.arkApiKey : DEFAULT_SETTINGS.arkApiKey,
      openaiApiKey: typeof raw?.openaiApiKey === "string" ? raw.openaiApiKey : DEFAULT_SETTINGS.openaiApiKey,
      openaiBaseUrl: typeof raw?.openaiBaseUrl === "string" ? raw.openaiBaseUrl : DEFAULT_SETTINGS.openaiBaseUrl,
      enabled: typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
      markerStyle: coerceMarkerStyle(raw?.markerStyle),
      markerLabels: typeof raw?.markerLabels === "boolean" ? raw.markerLabels : DEFAULT_SETTINGS.markerLabels,
      batchMax: clampBatchMax(raw?.batchMax ?? DEFAULT_SETTINGS.batchMax),
      verboseLogging: typeof raw?.verboseLogging === "boolean" ? raw.verboseLogging : DEFAULT_SETTINGS.verboseLogging
    };
  }

  // src/shared/messages.ts
  var MSG_TEST_KEY = "TEST_KEY";

  // src/popup/popup.ts
  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el;
  }
  async function loadSettings() {
    const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    return hydrateSettings(raw[SETTINGS_STORAGE_KEY]);
  }
  async function saveSettings(s) {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: s });
  }
  var PROVIDER_DEFAULT_MODEL = {
    dashscope: "qwen-turbo",
    ark: "doubao-seed-2-0-mini-260428",
    openai: "gpt-4o-mini"
  };
  function friendlyTestError(error) {
    const e = error ?? "unknown error";
    if (e.startsWith("no_api_key")) return "No key entered.";
    if (e.includes("no_base_url")) return "Enter a Base URL first.";
    if (e.includes("http_401")) return "Invalid or expired key (401).";
    if (e.includes("http_403")) return "Key can't access this model (403).";
    if (e.includes("http_404")) return "Not found (404) \u2014 check the Base URL / model id.";
    if (e.includes("http_429")) return "Rate limited (429) \u2014 key is valid, try later.";
    return e;
  }
  async function init() {
    const form = $("settings-form");
    const statusEl = $("status");
    const verboseLoggingInput = $("verbose-logging");
    const batchMaxInput = $("batch-max");
    const dashscopeKeyInput = $("dashscope-key");
    const arkKeyInput = $("ark-key");
    const openaiKeyInput = $("openai-key");
    const openaiBaseInput = $("openai-base");
    const showKeysInput = $("show-keys");
    const enabledInput = $("enabled");
    const markerLabelsInput = $("marker-labels");
    const testBtn = $("test-key");
    const testStatus = $("test-status");
    const sectionKeys = $("section-keys");
    const sectionModel = $("section-model");
    const providerSelect = $("provider-select");
    const modelInput = $("model-id");
    const blocks = {
      dashscope: $("block-dashscope"),
      ark: $("block-ark"),
      openai: $("block-openai")
    };
    const getKeyMode = () => {
      const checked = form.querySelector('input[name="keyMode"]:checked');
      return coerceKeyMode(checked?.value);
    };
    const applyModeVisibility = () => {
      const own = getKeyMode() === "own";
      sectionKeys.hidden = !own;
      sectionModel.hidden = !own;
    };
    const getProvider = () => coerceProvider(providerSelect.value);
    const applyProviderVisibility = () => {
      const p = getProvider();
      blocks.dashscope.hidden = p !== "dashscope";
      blocks.ark.hidden = p !== "ark";
      blocks.openai.hidden = p !== "openai";
    };
    const currentModelId = () => modelInput.value.trim() || DEFAULT_SETTINGS.modelId;
    const ensureHostPermission = async (baseUrl) => {
      if (getProvider() !== "openai") return true;
      try {
        const origin = `${new URL(baseUrl).origin}/*`;
        if (await chrome.permissions.contains({ origins: [origin] })) return true;
        return await chrome.permissions.request({ origins: [origin] });
      } catch {
        return false;
      }
    };
    const currentEndpoint = () => {
      switch (getProvider()) {
        case "ark":
          return { baseUrl: ARK_BASE_URL, key: arkKeyInput.value.trim() };
        case "openai":
          return { baseUrl: openaiBaseInput.value.trim(), key: openaiKeyInput.value.trim() };
        default:
          return { baseUrl: DASHSCOPE_BASE_URL, key: dashscopeKeyInput.value.trim() };
      }
    };
    const getMarkerStyle = () => {
      const checked = form.querySelector('input[name="markerStyle"]:checked');
      return coerceMarkerStyle(checked?.value);
    };
    const setMarkerStyle = (style) => {
      const el = form.querySelector(
        `input[name="markerStyle"][value="${style}"]`
      );
      if (el) el.checked = true;
    };
    const settings = await loadSettings();
    const modeRadio = form.querySelector(
      `input[name="keyMode"][value="${settings.keyMode}"]`
    );
    if (modeRadio) modeRadio.checked = true;
    applyModeVisibility();
    form.querySelectorAll('input[name="keyMode"]').forEach((r) => r.addEventListener("change", applyModeVisibility));
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
    $("openai-presets").querySelectorAll("button[data-base]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openaiBaseInput.value = btn.dataset.base ?? "";
        if (btn.dataset.model) modelInput.value = btn.dataset.model;
      });
    });
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
      if (!await ensureHostPermission(baseUrl)) {
        testStatus.textContent = "\u2717 Permission to reach that host was denied.";
        return;
      }
      testStatus.textContent = "Testing\u2026";
      testBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({
          type: MSG_TEST_KEY,
          baseUrl,
          modelId: currentModelId(),
          key
        });
        testStatus.textContent = res?.ok ? `\u2713 Works with ${res.modelId}.` : `\u2717 ${friendlyTestError(res?.error)}`;
      } catch {
        testStatus.textContent = "\u2717 Could not reach the extension worker. Reload the extension.";
      } finally {
        testBtn.disabled = false;
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.textContent = "";
      const next = {
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
        verboseLogging: verboseLoggingInput.checked
      };
      batchMaxInput.value = String(next.batchMax);
      modelInput.value = next.modelId;
      const needsPermission = next.keyMode === "own" && next.provider === "openai" && !!next.openaiBaseUrl;
      const permissionDenied = needsPermission && !await ensureHostPermission(next.openaiBaseUrl);
      try {
        await saveSettings(next);
        const { baseUrl, key } = currentEndpoint();
        const missing = next.keyMode === "own" && (!key || !baseUrl);
        statusEl.textContent = !next.enabled ? "Saved \u2014 extension is turned off." : permissionDenied ? "Saved \u2014 but access to that host was denied, so it can't run." : missing ? "Saved \u2014 but this provider needs a key (and Base URL) to run." : "Saved.";
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
})();
