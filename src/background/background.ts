import {
  MSG_CLASSIFY_BATCH,
  PORT_CLASSIFY_STREAM,
  type ClassifyBatchMessage,
  type ClassifyBatchResponse,
  type ClassifyStreamPortClientMsg,
  type ClassifyStreamPortServerMsg,
} from "../shared/messages";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { bootstrapSettingsFromBundledEnv } from "./env-bootstrap";
import { classifyBatchArk, classifyBatchArkStream, loadSettings } from "./ark-classify";

chrome.runtime.onInstalled.addListener((details) => {
  void bootstrapSettingsFromBundledEnv(details.reason);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CLASSIFY_STREAM) return;

  port.onMessage.addListener((raw: unknown) => {
    void (async () => {
      const msg = raw as ClassifyStreamPortClientMsg;
      try {
        const items = msg?.items;
        if (!Array.isArray(items) || items.length === 0) {
          port.postMessage({
            type: "final",
            response: { ok: false, error: "empty_batch" },
          } satisfies ClassifyStreamPortServerMsg);
          return;
        }
        const settings = await loadSettings();
        const modelId = settings.modelId?.trim() || DEFAULT_SETTINGS.modelId;

        const res = await classifyBatchArkStream(settings, items, (partial) => {
          port.postMessage({
            type: "partial",
            results: partial,
            modelId,
          } satisfies ClassifyStreamPortServerMsg);
        });
        port.postMessage({ type: "final", response: res } satisfies ClassifyStreamPortServerMsg);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "classify_stream_failed";
        port.postMessage({
          type: "final",
          response: { ok: false, error: errMsg },
        } satisfies ClassifyStreamPortServerMsg);
      }
    })();
  });
});

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
      const res = await classifyBatchArk(settings, items);
      sendResponse(res);
    })();

    return true;
  }
);
