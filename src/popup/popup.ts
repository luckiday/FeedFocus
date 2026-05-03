import {
  clampBatchMax,
  DEFAULT_SETTINGS,
  hydrateSettings,
  MODEL_PRESETS,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
} from "../shared/settings";

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

function fillModelSelect(select: HTMLSelectElement, currentId: string): void {
  select.innerHTML = "";
  for (const p of MODEL_PRESETS) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.label;
    select.appendChild(o);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "Custom…";
  select.appendChild(customOpt);

  const known = MODEL_PRESETS.some((m) => m.id === currentId);
  if (known) select.value = currentId;
  else {
    select.value = "custom";
  }
}

async function init(): Promise<void> {
  const form = $("settings-form") as HTMLFormElement;
  const modelSelect = $("model-id") as HTMLSelectElement;
  const modelCustomInput = $("model-custom") as HTMLInputElement;
  const statusEl = $("status");
  const customWrap = $("model-custom-wrap");
  const verboseLoggingInput = $("verbose-logging") as HTMLInputElement;
  const batchMaxInput = $("batch-max") as HTMLInputElement;

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
    const modelId =
      modelSelect.value === "custom"
        ? modelCustomInput.value.trim()
        : modelSelect.value.trim();

    const next: FeedFocusSettings = {
      modelId: modelId || DEFAULT_SETTINGS.modelId,
      batchMax: clampBatchMax(
        batchMaxInput.value === ""
          ? DEFAULT_SETTINGS.batchMax
          : Number(batchMaxInput.value)
      ),
      verboseLogging: verboseLoggingInput.checked,
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
