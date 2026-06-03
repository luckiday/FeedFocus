import {
  MSG_CLASSIFY_BATCH,
  MSG_TEST_KEY,
  PORT_CLASSIFY_STREAM,
  type ClassifyBatchMessage,
  type ClassifyBatchResponse,
  type ClassifyStreamPortClientMsg,
  type ClassifyStreamPortServerMsg,
  type TestKeyMessage,
  type TestKeyResponse,
} from "../shared/messages";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { bootstrapSettings } from "./env-bootstrap";
import {
  classifyBatchArk,
  classifyBatchArkStream,
  loadSettings,
  testApiKey,
} from "./ark-classify";
import { classifyBatchViaProxy } from "./proxy-classify";

chrome.runtime.onInstalled.addListener(() => {
  void bootstrapSettings();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CLASSIFY_STREAM) return;

  let portAlive = true;
  port.onDisconnect.addListener(() => {
    portAlive = false;
  });

  function safePost(msg: ClassifyStreamPortServerMsg): void {
    if (!portAlive) return;
    try {
      port.postMessage(msg);
    } catch {
      portAlive = false;
    }
  }

  port.onMessage.addListener((raw: unknown) => {
    void (async () => {
      const msg = raw as ClassifyStreamPortClientMsg;
      try {
        const items = msg?.items;
        if (!Array.isArray(items) || items.length === 0) {
          safePost({
            type: "final",
            response: { ok: false, error: "empty_batch" },
          } satisfies ClassifyStreamPortServerMsg);
          return;
        }
        const settings = await loadSettings();

        if (settings.keyMode === "free") {
          const res = await classifyBatchViaProxy(items);
          safePost({ type: "final", response: res } satisfies ClassifyStreamPortServerMsg);
          return;
        }

        const modelId = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;

        const res = await classifyBatchArkStream(settings, items, (partial) => {
          safePost({
            type: "partial",
            results: partial,
            modelId,
          } satisfies ClassifyStreamPortServerMsg);
        });
        safePost({ type: "final", response: res } satisfies ClassifyStreamPortServerMsg);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "classify_stream_failed";
        safePost({
          type: "final",
          response: { ok: false, error: errMsg },
        } satisfies ClassifyStreamPortServerMsg);
      }
    })();
  });
});

chrome.runtime.onMessage.addListener(
  (
    message: TestKeyMessage,
    _sender,
    sendResponse: (r: TestKeyResponse) => void
  ) => {
    if (!message || message.type !== MSG_TEST_KEY) return false;
    void (async () => {
      sendResponse(await testApiKey(message.baseUrl, message.modelId, message.key));
    })();
    return true;
  }
);

chrome.runtime.onMessage.addListener(
  (
    message: ClassifyBatchMessage,
    _sender,
    sendResponse: (r: ClassifyBatchResponse) => void
  ) => {
    if (!message || message.type !== MSG_CLASSIFY_BATCH) {
      return false;
    }
    const items = message.items;
    if (!Array.isArray(items) || items.length === 0) {
      sendResponse({ ok: false, error: "empty_batch" });
      return false;
    }

    void (async () => {
      const settings = await loadSettings();
      const res =
        settings.keyMode === "free"
          ? await classifyBatchViaProxy(items)
          : await classifyBatchArk(settings, items);
      sendResponse(res);
    })();

    return true;
  }
);
