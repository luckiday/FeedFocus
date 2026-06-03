/** Stable per-install id sent to the proxy for free-tier rate limiting. */
const DEVICE_ID_KEY = "feedFocusDeviceId";

export async function getDeviceId(): Promise<string> {
  const raw = await chrome.storage.local.get(DEVICE_ID_KEY);
  const existing = raw[DEVICE_ID_KEY];
  if (typeof existing === "string" && existing) return existing;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: id });
  return id;
}
