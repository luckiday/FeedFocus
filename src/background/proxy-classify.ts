import { isProxyConfigured, PROXY_BASE_URL } from "../shared/config";
import { getDeviceId } from "../shared/device-id";
import { normalizeClassifyBatchItems } from "../shared/normalize-llm-input";
import type {
  ClassifyBatchItem,
  ClassifyBatchResponse,
  TierLetter,
} from "../shared/messages";

function parseTier(v: unknown): TierLetter | null {
  if (v === "G" || v === "Y" || v === "R") return v;
  return null;
}

/** Free mode: send the batch to the shared proxy, which holds the key + limits. */
export async function classifyBatchViaProxy(
  items: ClassifyBatchItem[]
): Promise<ClassifyBatchResponse> {
  if (!isProxyConfigured()) {
    return { ok: false, error: "proxy_not_configured" };
  }

  const normalized = normalizeClassifyBatchItems(items);
  const expectedIds = new Set(normalized.map((x) => x.id));

  let res: Response;
  try {
    const deviceId = await getDeviceId();
    res = await fetch(`${PROXY_BASE_URL.replace(/\/+$/, "")}/classify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: JSON.stringify({ items: normalized }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }

  if (!res.ok) {
    let err = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string") err = body.error;
    } catch {
      /* non-JSON error body */
    }
    return { ok: false, error: err };
  }

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    results?: { id?: unknown; v?: unknown }[];
    modelId?: unknown;
  } | null;

  if (!data?.ok || !Array.isArray(data.results)) {
    return { ok: false, error: "proxy_bad_response" };
  }

  const results: { id: string; v: TierLetter }[] = [];
  const seen = new Set<string>();
  for (const row of data.results) {
    const id = row?.id;
    const v = parseTier(row?.v);
    if (typeof id !== "string" || !expectedIds.has(id) || seen.has(id) || !v) continue;
    seen.add(id);
    results.push({ id, v });
  }

  return {
    ok: true,
    results,
    modelId: typeof data.modelId === "string" ? data.modelId : "free",
  };
}
