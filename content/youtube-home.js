"use strict";
(() => {
  // src/content/heuristics.ts
  var EDU_CHANNEL_HINTS = [
    "MIT",
    "OpenCourseWare",
    "Stanford",
    "Veritasium",
    "3Blue1Brown",
    "Khan Academy",
    "TED-Ed",
    "MinutePhysics",
    "Computerphile"
  ];
  var RED_FLAG_WORDS = /\b(?:INSANE|CRAZY|TIKTOK|BRAIN\s*ROT|COMPILATION|GONE\s*WRONG|YOU\s*WON'?T\s*BELIEVE)\b/i;
  function countAllCapsWords(text) {
    return text.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 1 && w === w.toUpperCase()).length;
  }
  function classifyHeuristicDetailed(title, channel) {
    const t = title || "";
    const c = channel || "";
    const blob = `${t} ${c}`;
    const bangs = (t.match(/!/g) ?? []).length;
    const capsWords = t.length ? countAllCapsWords(t) : 0;
    const rReasons = [];
    if (capsWords > 2) {
      rReasons.push(`rule:R:title_all_caps_word_count=${capsWords}(>2)`);
    }
    if (bangs > 2) {
      rReasons.push(`rule:R:title_exclamation_count=${bangs}(>2)`);
    }
    if (RED_FLAG_WORDS.test(blob)) {
      rReasons.push("rule:R:clickbait_keyword_or_pattern_match");
    }
    if (rReasons.length > 0) {
      return { tier: "R", reasons: rReasons };
    }
    const ch = c.toLowerCase();
    for (const hint of EDU_CHANNEL_HINTS) {
      if (ch.includes(hint.toLowerCase())) {
        return {
          tier: "G",
          reasons: [`rule:G:edu_channel_substring="${hint}"`]
        };
      }
    }
    return {
      tier: "Y",
      reasons: ["rule:Y:default_no_strong_signal"]
    };
  }

  // src/shared/branding.ts
  var EXTENSION_SHORT_NAME = "Feed Focus";
  var EXTENSION_LOG_PREFIX = `[${EXTENSION_SHORT_NAME}]`;

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

  // src/content/classification-log.ts
  var verboseLogging = DEFAULT_SETTINGS.verboseLogging;
  var classificationHintShown = false;
  function maybeShowConsoleHint() {
    if (!verboseLogging || classificationHintShown) return;
    classificationHintShown = true;
    console.info(
      `${EXTENSION_LOG_PREFIX} verbose logging on \u2014 open DevTools \u2192 Console on this tab and filter for "${EXTENSION_SHORT_NAME}".`
    );
  }
  function refreshFromStorage() {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, (raw) => {
      const s = raw[SETTINGS_STORAGE_KEY];
      const prev = verboseLogging;
      verboseLogging = typeof s?.verboseLogging === "boolean" ? s.verboseLogging : DEFAULT_SETTINGS.verboseLogging;
      if (!prev && verboseLogging) classificationHintShown = false;
      maybeShowConsoleHint();
    });
  }
  function attachVerboseLoggingSync() {
    refreshFromStorage();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const ch = changes[SETTINGS_STORAGE_KEY];
      if (!ch?.newValue) return;
      const nv = ch.newValue;
      const prev = verboseLogging;
      if (typeof nv.verboseLogging === "boolean") {
        verboseLogging = nv.verboseLogging;
      }
      if (!prev && verboseLogging) classificationHintShown = false;
      maybeShowConsoleHint();
    });
  }
  function logClassification(entry) {
    if (!verboseLogging) return;
    const row = {
      ...entry,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    };
    console.info(`${EXTENSION_LOG_PREFIX} classification`, row);
  }

  // src/shared/messages.ts
  var PORT_CLASSIFY_STREAM = "DOPAMINE_CLASSIFY_STREAM";

  // src/shared/tier-cache.ts
  var TIER_CACHE_STORAGE_KEY = "feedFocusYoutubeTierCache";
  var MAX_ENTRIES = 2e3;
  var localEntries = null;
  var writeChain = Promise.resolve();
  function isTier(v) {
    return v === "G" || v === "Y" || v === "R";
  }
  async function ensureLocal() {
    if (localEntries) return localEntries;
    const raw = await chrome.storage.local.get(TIER_CACHE_STORAGE_KEY);
    const blob = raw[TIER_CACHE_STORAGE_KEY];
    localEntries = blob?.e && typeof blob.e === "object" ? { ...blob.e } : {};
    return localEntries;
  }
  async function tierCacheGet(id) {
    const e = await ensureLocal();
    const row = e[id];
    if (!row || !isTier(row.v)) return null;
    return row;
  }
  function tierCachePutMany(rows) {
    if (rows.length === 0) return;
    writeChain = writeChain.then(async () => {
      const raw = await chrome.storage.local.get(TIER_CACHE_STORAGE_KEY);
      const prev = raw[TIER_CACHE_STORAGE_KEY]?.e;
      const e = prev && typeof prev === "object" ? { ...prev } : {};
      const now = Date.now();
      for (const r of rows) {
        e[r.id] = { v: r.v, m: r.modelId, t: now };
      }
      const keys = Object.keys(e);
      if (keys.length > MAX_ENTRIES) {
        const scored = keys.map((k) => ({ k, t: e[k].t }));
        scored.sort((a, b) => a.t - b.t);
        const drop = keys.length - MAX_ENTRIES;
        for (let i = 0; i < drop; i++) delete e[scored[i].k];
      }
      localEntries = e;
      await chrome.storage.local.set({
        [TIER_CACHE_STORAGE_KEY]: { e }
      });
    }).catch((err) => {
      console.warn(`${EXTENSION_LOG_PREFIX} tier cache write failed`, err);
    });
  }

  // src/content/markers.ts
  var MARKER_CLASS = "ff-focus-marker";
  var CHECKED_ATTR = "data-ff-focus-checked";
  var HEURISTIC_TIER_KEY = "ffFocusHeuristicTier";
  var MARKER_HEURISTIC_CLASS = `${MARKER_CLASS}--heuristic`;
  var markerPrefs = {
    style: "dot",
    labels: true
  };
  function paintMarker(card, dot, state) {
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

  // src/shared/normalize-llm-input.ts
  var INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u2060\u180E\u00AD\u061C\u200E\u200F]/g;
  var BIDI_EMBEDS = /[\u202A-\u202E]/g;
  var DURATION_LABEL = /^\d{1,2}:\d{2}(:\d{2})?$/;
  function normalizeLlmText(raw) {
    let s = raw.normalize("NFKC");
    s = s.replace(INVISIBLE_CHARS, "").replace(BIDI_EMBEDS, "");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }
  function normalizeVideoItemId(raw) {
    const t = normalizeLlmText(raw).replace(/\s+/g, "");
    return t;
  }
  function normalizeClassifyBatchItem(item) {
    const id = normalizeVideoItemId(item.id);
    const t = normalizeLlmText(item.t);
    const c = normalizeLlmText(item.c);
    const out = { id, t, c };
    if (item.d) {
      const d = normalizeLlmText(item.d);
      if (DURATION_LABEL.test(d)) out.d = d;
    }
    if (item.vc) {
      const vc = normalizeLlmText(item.vc);
      if (vc) out.vc = vc;
    }
    if (item.pub) {
      const pub = normalizeLlmText(item.pub);
      if (pub) out.pub = pub;
    }
    if (item.h) {
      const h = normalizeLlmText(item.h);
      const bare = h.replace(/^@+/, "").trim();
      if (bare) out.h = `@${bare}`;
    }
    if (item.short === true) out.short = true;
    return out;
  }

  // src/content/yt-dom.ts
  var CARD_SELECTORS = ["ytd-rich-item-renderer", "ytd-video-renderer"];
  var TITLE_SELECTORS = [
    "a.ytLockupMetadataViewModelTitle",
    "h3.ytLockupMetadataViewModelHeadingReset a.ytLockupMetadataViewModelTitle",
    "h3.shortsLockupViewModelHostMetadataTitle a",
    "a.shortsLockupViewModelHostOutsideMetadataEndpoint",
    "a#video-title",
    "#video-title",
    "h3 a#video-title",
    "a.yt-simple-endpoint.style-scope.ytd-rich-grid-media"
  ];
  var CHANNEL_SELECTORS = [
    ".ytContentMetadataViewModelMetadataRow a[href*='/@']",
    ".ytContentMetadataViewModelMetadataRow a[href*='/channel/']",
    ".ytContentMetadataViewModelMetadataRow a[href*='/c/']",
    ".ytContentMetadataViewModelMetadataRow a.ytAttributedStringLink",
    "ytd-channel-name yt-formatted-string a",
    "ytd-channel-name a",
    "ytd-channel-name yt-formatted-string",
    "#channel-name a",
    "ytd-channel-name #text",
    "#channel-name yt-formatted-string"
  ];
  var THUMBNAIL_HOST_SELECTORS = [
    "a.ytLockupViewModelContentImage",
    "a.shortsLockupViewModelHostEndpoint.reel-item-endpoint",
    "ytd-thumbnail a#thumbnail",
    "a#thumbnail",
    "ytd-rich-grid-media a#thumbnail"
  ];
  function queryVideoCards(root = document) {
    const seen = /* @__PURE__ */ new Set();
    const list = [];
    for (const sel of CARD_SELECTORS) {
      root.querySelectorAll(sel).forEach((node) => {
        if (node instanceof HTMLElement && !seen.has(node)) {
          seen.add(node);
          list.push(node);
        }
      });
    }
    return list;
  }
  function textFromSelectors(el, selectors) {
    for (const sel of selectors) {
      const node = el.querySelector(sel);
      if (node?.textContent) {
        const t = node.textContent.replace(/\s+/g, " ").trim();
        if (t) return t;
      }
    }
    return null;
  }
  function getTitle(el) {
    return textFromSelectors(el, TITLE_SELECTORS);
  }
  function getChannelName(el) {
    return textFromSelectors(el, CHANNEL_SELECTORS);
  }
  function getVideoId(card) {
    const links = card.querySelectorAll("a[href]");
    for (let i = 0; i < links.length; i++) {
      const a = links[i];
      const href = a.getAttribute("href") || "";
      const watch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (watch) return watch[1];
      const short = href.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (short) return short[1];
    }
    return null;
  }
  function stableItemKey(card, title, channel) {
    const v = getVideoId(card);
    if (v) return v;
    let h = 5381;
    const s = `${title}\0${channel}`;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h, 33) ^ s.charCodeAt(i);
    }
    return `h${(h >>> 0).toString(16)}`;
  }
  function getTileMarkerHost(card) {
    const inner = card.querySelector("#content");
    if (inner instanceof HTMLElement) {
      ensurePositioned(inner);
      return inner;
    }
    ensurePositioned(card);
    return card;
  }
  function getThumbnailHost(card) {
    for (const sel of THUMBNAIL_HOST_SELECTORS) {
      const el = card.querySelector(sel);
      if (el instanceof HTMLElement) {
        ensurePositioned(el);
        return el;
      }
    }
    const vm = card.querySelector("yt-thumbnail-view-model");
    if (vm instanceof HTMLElement) {
      ensurePositioned(vm);
      return vm;
    }
    return null;
  }
  function ensurePositioned(el) {
    const pos = getComputedStyle(el).position;
    if (pos === "static" || pos === "") el.style.position = "relative";
  }
  function isShortsCard(card) {
    for (const sel of THUMBNAIL_HOST_SELECTORS) {
      const el = card.querySelector(sel);
      const href = el?.getAttribute("href") || "";
      if (href.includes("/shorts/")) return true;
    }
    const a = card.querySelector(
      "a[href*='/shorts/']"
    );
    return !!a;
  }
  function getVideoDurationLabel(card) {
    const nodes = card.querySelectorAll(
      "yt-thumbnail-badge-view-model .ytBadgeShapeText, badge-shape .ytBadgeShapeText"
    );
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const t = node.textContent?.replace(/\s+/g, " ").trim();
      if (t && /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t;
    }
    return null;
  }
  function getChannelHandle(card) {
    const a = card.querySelector(
      '.ytContentMetadataViewModelMetadataRow a[href*="/@"]'
    );
    if (!a) return null;
    const href = a.getAttribute("href") || "";
    const m = href.match(/\/@([^/?#]+)/);
    if (!m) return null;
    try {
      return `@${decodeURIComponent(m[1])}`;
    } catch {
      return `@${m[1]}`;
    }
  }
  function getTileMetaForLlm(card) {
    const shorts = isShortsCard(card);
    const duration = getVideoDurationLabel(card);
    const handle = getChannelHandle(card);
    let views = null;
    let uploadedAgo = null;
    const row = card.querySelector(".ytContentMetadataViewModelMetadataRow") ?? card.querySelector("#metadata-line");
    if (row) {
      const spans = row.querySelectorAll(
        "span.ytContentMetadataViewModelMetadataText[role='text']"
      );
      for (let i = 0; i < spans.length; i++) {
        const el = spans[i];
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!text) continue;
        if (aria.includes("view")) views = text;
        else if (/\bago\b$/i.test(text) || /^\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i.test(
          aria
        ) || /streamed|premiered/i.test(aria)) {
          uploadedAgo = text;
        }
      }
    }
    if (shorts && !views) {
      const sub = card.querySelector(
        ".shortsLockupViewModelHostOutsideMetadataSubhead span[role='text'], .shortsLockupViewModelHostOutsideMetadataSubhead .ytContentMetadataViewModelMetadataText"
      );
      const t = sub?.textContent?.replace(/\s+/g, " ").trim();
      if (t) views = t;
    }
    if (!views && !uploadedAgo && row && row.textContent) {
      const compact = row.textContent.replace(/\s+/g, " ").trim();
      const parts = compact.split("\xB7").map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        if (/view/i.test(p) || /^[\d.]+\s*[KMB]?$/i.test(p)) {
          if (!views) views = p;
        } else if (/\bago\b|Streamed|Premiered|Live/i.test(p)) {
          if (!uploadedAgo) uploadedAgo = p;
        }
      }
    }
    return { duration, views, uploadedAgo, handle, shorts };
  }
  function buildClassifyBatchItem(card, id, title, channel) {
    const meta = getTileMetaForLlm(card);
    const item = { id, t: title, c: channel };
    if (meta.duration) item.d = meta.duration;
    if (meta.views) item.vc = meta.views;
    if (meta.uploadedAgo) item.pub = meta.uploadedAgo;
    if (meta.handle) item.h = meta.handle;
    if (meta.shorts) item.short = true;
    return normalizeClassifyBatchItem(item);
  }

  // src/content/llm-batch.ts
  var FLUSH_MS = 1e3;
  var MAX_CONCURRENT_FLUSHES = 2;
  var pending = /* @__PURE__ */ new Map();
  var debounceTimer = null;
  var inFlightFlushes = 0;
  function takeBatchSnapshot(maxKeys) {
    const snap = /* @__PURE__ */ new Map();
    let n = 0;
    for (const [id, entry] of pending) {
      if (n >= maxKeys) break;
      snap.set(id, entry);
      pending.delete(id);
      n++;
    }
    return snap;
  }
  function scheduleDebounceFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushQueue();
    }, FLUSH_MS);
  }
  function resetLlmQueue() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pending.clear();
  }
  async function loadSettingsSnapshot() {
    const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    return hydrateSettings(raw[SETTINGS_STORAGE_KEY]);
  }
  function sendClassifyBatchStreaming(items, onPartial) {
    return new Promise((resolve) => {
      let settled = false;
      const port = chrome.runtime.connect({ name: PORT_CLASSIFY_STREAM });
      const finish = (r) => {
        if (settled) return;
        settled = true;
        try {
          port.disconnect();
        } catch {
        }
        resolve(r);
      };
      port.onMessage.addListener((msg) => {
        if (msg.type === "partial") {
          onPartial(msg.results, msg.modelId);
        } else if (msg.type === "final") {
          finish(msg.response);
        }
      });
      port.onDisconnect.addListener(() => {
        if (!settled) {
          finish({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "port_disconnected"
          });
        }
      });
      const payload = { items };
      port.postMessage(payload);
    });
  }
  function mergeBatchItem(prev, next) {
    const m = {
      id: prev.id,
      t: next.t || prev.t,
      c: next.c || prev.c
    };
    if (next.d || prev.d) m.d = next.d || prev.d;
    if (next.vc || prev.vc) m.vc = next.vc || prev.vc;
    if (next.pub || prev.pub) m.pub = next.pub || prev.pub;
    if (next.h || prev.h) m.h = next.h || prev.h;
    if (next.short || prev.short) m.short = true;
    return normalizeClassifyBatchItem(m);
  }
  function tierLetterToTier(v) {
    const u = v.toUpperCase();
    if (u === "G" || u === "Y" || u === "R") return u;
    return null;
  }
  function readHeuristicTier(card) {
    const raw = card.dataset[HEURISTIC_TIER_KEY];
    if (raw === "G" || raw === "Y" || raw === "R") return raw;
    return null;
  }
  function applyHeuristicFallbackFromPending(card) {
    const tier = readHeuristicTier(card);
    const dot = card.querySelector(`.${MARKER_CLASS}`);
    if (!dot) return;
    paintMarker(card, dot, { kind: "heuristic" });
    dot.title = tier ? `${EXTENSION_SHORT_NAME}: no model tier (gray). Rule hint: ${tier}.` : `${EXTENSION_SHORT_NAME}: no model tier (gray).`;
  }
  function applyCachedLlmTierToCard(card, tierLetter, storedModelId) {
    const tier = tierLetterToTier(tierLetter);
    if (!tier) return;
    const dot = card.querySelector(`.${MARKER_CLASS}`);
    if (!dot) return;
    paintMarker(card, dot, { kind: "tier", tier });
    dot.title = `${EXTENSION_SHORT_NAME}: cached LLM (${storedModelId}) \xB7 ${tier}`;
    const title = getTitle(card) ?? "";
    const channel = getChannelName(card) ?? "";
    const videoId = getVideoId(card);
    logClassification({
      method: "llm_cached",
      videoId,
      title,
      channel,
      tier,
      detail: ["source:tier_cache"],
      modelId: storedModelId
    });
  }
  function applyLlmTierToCard(card, tierLetter, modelId) {
    const tier = tierLetterToTier(tierLetter);
    if (!tier) return;
    const dot = card.querySelector(`.${MARKER_CLASS}`);
    if (!dot) return;
    paintMarker(card, dot, { kind: "tier", tier });
    dot.title = `${EXTENSION_SHORT_NAME}: LLM (${modelId}) \xB7 ${tier}`;
    const title = getTitle(card) ?? "";
    const channel = getChannelName(card) ?? "";
    const videoId = getVideoId(card);
    logClassification({
      method: "llm",
      videoId,
      title,
      channel,
      tier,
      detail: [`model:${modelId}`, `tier:${tier}`],
      modelId
    });
  }
  async function enqueueCardForLlm(card, item) {
    const settings = await loadSettingsSnapshot();
    const id = item.id;
    const cached = await tierCacheGet(id);
    if (cached) {
      if (card.isConnected) applyCachedLlmTierToCard(card, cached.v, cached.m);
      return;
    }
    let entry = pending.get(id);
    if (!entry) {
      entry = { item: { ...item }, cards: [] };
      pending.set(id, entry);
    } else {
      entry.item = mergeBatchItem(entry.item, item);
    }
    if (!entry.cards.includes(card)) entry.cards.push(card);
    if (pending.size >= settings.batchMax) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void flushQueue();
    } else {
      scheduleDebounceFlush();
    }
  }
  async function flushQueue() {
    if (pending.size === 0) return;
    if (inFlightFlushes >= MAX_CONCURRENT_FLUSHES) return;
    const settings = await loadSettingsSnapshot();
    const batchMax = settings.batchMax;
    const snapshot = takeBatchSnapshot(batchMax);
    if (snapshot.size === 0) return;
    inFlightFlushes++;
    try {
      const { verboseLogging: verboseLogging2 } = settings;
      const items = [];
      for (const [, v] of snapshot) {
        items.push(v.item);
      }
      const appliedLlmIds = /* @__PURE__ */ new Set();
      const res = await sendClassifyBatchStreaming(items, (partial, modelId) => {
        const cacheRows = [];
        for (const r of partial) {
          const entry = snapshot.get(r.id);
          if (!entry || appliedLlmIds.has(r.id)) continue;
          appliedLlmIds.add(r.id);
          cacheRows.push({ id: r.id, v: r.v, modelId });
          for (const card of entry.cards) {
            if (card.isConnected) applyLlmTierToCard(card, r.v, modelId);
          }
        }
        tierCachePutMany(cacheRows);
      });
      if (!res.ok) {
        const errStr = String(res.error);
        if (errStr.includes("global_cap")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} Free tier is at today's global limit for everyone. Try later, or switch to your own API key in the popup for unlimited use.`,
            res.error
          );
        } else if (errStr.includes("rate_limited")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} You hit today's free-tier limit. Switch to your own API key in the popup for higher limits.`,
            res.error
          );
        } else if (errStr.includes("proxy_not_configured")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} Free mode isn't configured in this build. Set PROXY_BASE_URL (src/shared/config.ts) or switch to your own API key in the popup.`,
            res.error
          );
        } else if (errStr.includes("no_api_key")) {
          const provider = errStr.endsWith("ark") ? "Ark" : "DashScope";
          console.warn(
            `${EXTENSION_LOG_PREFIX} LLM skipped \u2014 no API key. Open the extension popup and paste your ${provider} API key for the selected model. Tiles fall back to gray rule hints until then.`,
            res.error
          );
        } else if (errStr.includes("http_401")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} LLM skipped (401 invalid/expired key). Open the extension popup and confirm the API key matches the provider for your selected model.`,
            res.error
          );
        } else if (errStr.includes("http_403")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} LLM skipped (403 Forbidden). Often: API key cannot call this model/region, account or quota policy. Read the JSON after http_403 below. If the message mentions rate/flow control, lower Max batch size in the popup.`,
            res.error
          );
        } else if (errStr.includes("http_429")) {
          console.warn(
            `${EXTENSION_LOG_PREFIX} LLM skipped (429 rate limit). Slow down: lower Max batch size in the popup or adjust FLUSH_MS / MAX_CONCURRENT_FLUSHES in llm-batch.ts; wait before retrying.`,
            res.error
          );
        } else if (verboseLogging2) {
          console.warn(`${EXTENSION_LOG_PREFIX} LLM batch skipped:`, res.error);
        } else {
          console.debug(`${EXTENSION_LOG_PREFIX} LLM batch skipped:`, res.error);
        }
        for (const [, v] of snapshot) {
          for (const card of v.cards) {
            if (card.isConnected) applyHeuristicFallbackFromPending(card);
          }
        }
        return;
      }
      const byId = new Map(res.results.map((r) => [r.id, r.v]));
      const finalCache = [];
      for (const [id, v] of snapshot) {
        const letter = byId.get(id);
        if (letter) {
          if (!appliedLlmIds.has(id)) {
            appliedLlmIds.add(id);
            finalCache.push({ id, v: letter, modelId: res.modelId });
            for (const card of v.cards) {
              if (card.isConnected) applyLlmTierToCard(card, letter, res.modelId);
            }
          }
        } else {
          for (const card of v.cards) {
            if (card.isConnected) applyHeuristicFallbackFromPending(card);
          }
        }
      }
      tierCachePutMany(finalCache);
    } finally {
      inFlightFlushes--;
      if (pending.size >= batchMax) {
        void flushQueue();
      } else if (pending.size > 0) {
        scheduleDebounceFlush();
        if (inFlightFlushes < MAX_CONCURRENT_FLUSHES) {
          void flushQueue();
        }
      }
    }
  }

  // src/content/youtube-home.ts
  var extensionEnabled = true;
  async function syncPrefs() {
    const s = await loadSettingsSnapshot();
    extensionEnabled = s.enabled;
    markerPrefs.style = s.markerStyle;
    markerPrefs.labels = s.markerLabels;
  }
  function removeMarkersFromCard(card) {
    const nodes = card.querySelectorAll(`.${MARKER_CLASS}`);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].remove();
    }
  }
  async function processCard(card) {
    if (!extensionEnabled) return;
    if (card.getAttribute(CHECKED_ATTR) === "true") return;
    const thumb = getThumbnailHost(card);
    const title = getTitle(card) ?? "";
    const channel = getChannelName(card) ?? "";
    if (!thumb || !title && !channel) return;
    card.setAttribute(CHECKED_ATTR, "true");
    removeMarkersFromCard(card);
    const rule = classifyHeuristicDetailed(title, channel);
    const tier = rule.tier;
    const videoId = getVideoId(card);
    const itemId = stableItemKey(card, title, channel);
    card.dataset.ffVid = itemId;
    card.dataset[HEURISTIC_TIER_KEY] = tier;
    logClassification({
      method: "rule",
      videoId,
      title,
      channel,
      tier,
      detail: [...rule.reasons, "visual:pending_until_llm"]
    });
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dot.className = MARKER_CLASS;
    paintMarker(card, dot, { kind: "pending" });
    dot.title = `${EXTENSION_SHORT_NAME}: waiting for model\u2026`;
    getTileMarkerHost(card).appendChild(dot);
    void enqueueCardForLlm(card, buildClassifyBatchItem(card, itemId, title, channel));
  }
  var scheduled = null;
  function scheduleScan() {
    if (scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      try {
        for (const card of queryVideoCards()) {
          void processCard(card).catch((err) => {
            console.error(`${EXTENSION_LOG_PREFIX} processCard error`, err);
          });
        }
      } catch (e) {
        console.error(`${EXTENSION_LOG_PREFIX} scan error`, e);
      }
    }, 120);
  }
  function clearAllMarkers() {
    resetLlmQueue();
    for (const card of queryVideoCards()) {
      card.removeAttribute(CHECKED_ATTR);
      delete card.dataset.ffVid;
      delete card.dataset[HEURISTIC_TIER_KEY];
      delete card.dataset.ffTier;
      delete card.dataset.ffStyle;
      removeMarkersFromCard(card);
    }
  }
  function resetCards() {
    clearAllMarkers();
    scheduleScan();
  }
  function attachObserver() {
    const target = document.querySelector("ytd-app") ?? document.body;
    new MutationObserver(() => scheduleScan()).observe(target, {
      childList: true,
      subtree: true
    });
  }
  attachVerboseLoggingSync();
  void syncPrefs().then(() => {
    if (extensionEnabled) scheduleScan();
  });
  attachObserver();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_STORAGE_KEY]) return;
    void syncPrefs().then(() => {
      if (extensionEnabled) resetCards();
      else clearAllMarkers();
    });
  });
  window.addEventListener("yt-page-data-updated", scheduleScan);
  document.addEventListener("yt-page-data-updated", scheduleScan);
  window.addEventListener("yt-navigate-finish", resetCards);
  document.addEventListener("yt-navigate-finish", resetCards);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleScan();
  });
})();
