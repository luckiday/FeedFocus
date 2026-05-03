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
  var DEFAULT_SETTINGS = {
    modelId: "qwen-turbo",
    batchMax: DEFAULT_BATCH_MAX,
    verboseLogging: false
  };
  var MODEL_PRESETS = [
    { id: "qwen-turbo", label: "Qwen Turbo (Aliyun DashScope)" },
    { id: "qwen3.6-plus", label: "Qwen Plus (Aliyun DashScope)" },
    { id: "qwen3.5-flash", label: "Qwen Flash (Aliyun DashScope)" },
    { id: "doubao-seed-2-0-mini-260215", label: "Doubao Seed 2.0 Mini (Volcengine Ark)" }
  ];

  // src/popup/popup.ts
  function $(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing #${id}`);
    return el;
  }
  async function loadSettings() {
    const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const s = raw[SETTINGS_STORAGE_KEY];
    return {
      modelId: typeof s?.modelId === "string" ? s.modelId : DEFAULT_SETTINGS.modelId,
      batchMax: clampBatchMax(s?.batchMax ?? DEFAULT_SETTINGS.batchMax),
      verboseLogging: typeof s?.verboseLogging === "boolean" ? s.verboseLogging : DEFAULT_SETTINGS.verboseLogging
    };
  }
  async function saveSettings(s) {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: s });
  }
  function fillModelSelect(select, currentId) {
    select.innerHTML = "";
    for (const p of MODEL_PRESETS) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.label;
      select.appendChild(o);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom\u2026";
    select.appendChild(customOpt);
    const known = MODEL_PRESETS.some((m) => m.id === currentId);
    if (known) select.value = currentId;
    else {
      select.value = "custom";
    }
  }
  async function init() {
    const form = $("settings-form");
    const modelSelect = $("model-id");
    const modelCustomInput = $("model-custom");
    const statusEl = $("status");
    const customWrap = $("model-custom-wrap");
    const verboseLoggingInput = $("verbose-logging");
    const batchMaxInput = $("batch-max");
    const settings = await loadSettings();
    verboseLoggingInput.checked = settings.verboseLogging;
    batchMaxInput.value = String(settings.batchMax);
    fillModelSelect(modelSelect, settings.modelId);
    const presetIds = MODEL_PRESETS.map((m) => m.id);
    if (presetIds.includes(settings.modelId)) {
      modelCustomInput.value = DEFAULT_SETTINGS.modelId;
      customWrap.hidden = true;
    } else {
      modelCustomInput.value = settings.modelId;
      customWrap.hidden = false;
    }
    modelSelect.addEventListener("change", () => {
      const isCustom = modelSelect.value === "custom";
      customWrap.hidden = !isCustom;
      if (!isCustom) modelCustomInput.value = modelSelect.value;
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.textContent = "";
      const modelId = modelSelect.value === "custom" ? modelCustomInput.value.trim() : modelSelect.value.trim();
      const next = {
        modelId: modelId || DEFAULT_SETTINGS.modelId,
        batchMax: clampBatchMax(
          batchMaxInput.value === "" ? DEFAULT_SETTINGS.batchMax : Number(batchMaxInput.value)
        ),
        verboseLogging: verboseLoggingInput.checked
      };
      batchMaxInput.value = String(next.batchMax);
      try {
        await saveSettings(next);
        statusEl.textContent = "Saved.";
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
