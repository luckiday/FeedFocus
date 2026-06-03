import {
  hydrateSettings,
  SETTINGS_STORAGE_KEY,
  type FeedFocusSettings,
} from "../shared/settings";

/**
 * On install/update, normalize stored settings — chiefly migrating any old
 * model id to its current canonical id (see `migrateModelId`). API keys are
 * user-supplied via the popup and are never bundled, so there is nothing to
 * inject here.
 */
export async function bootstrapSettings(): Promise<void> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const cur = raw[SETTINGS_STORAGE_KEY] as Partial<FeedFocusSettings> | undefined;
  if (cur === undefined) return; // fresh install: defaults apply lazily on first read

  const merged = hydrateSettings(cur);
  if (cur.modelId === merged.modelId) return; // nothing changed

  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: merged });
}
