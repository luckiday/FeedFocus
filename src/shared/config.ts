/**
 * Deployment config (not secrets).
 *
 * After you `wrangler deploy` the proxy in ../proxy, set PROXY_BASE_URL to the
 * printed URL, then rebuild the extension. Free mode calls `${PROXY_BASE_URL}/classify`.
 */
export const PROXY_BASE_URL = "https://feed-focus-proxy.guoyunqi.workers.dev";

/** True once the proxy URL has actually been set (Free mode is usable). */
export function isProxyConfigured(): boolean {
  return !PROXY_BASE_URL.includes("YOUR-SUBDOMAIN");
}
