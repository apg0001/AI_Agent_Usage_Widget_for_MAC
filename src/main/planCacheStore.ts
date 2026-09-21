import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ProviderId } from "../shared/types.js";

/**
 * Some providers only report the subscription plan through an API call that
 * needs a live credential. Gemini is the extreme case: nothing on disk names
 * the tier, and the CLI's access token expires about an hour after its last
 * run. A plan changes far less often than a token expires, so the last value
 * we saw is cached here and keeps the badge alive across restarts.
 *
 * The directory is injected by the main process instead of imported from
 * electron so that this module stays usable outside a running app.
 */
type PlanCacheEntry = { label: string; observedAt: string };
type PlanCacheShape = Partial<Record<ProviderId, PlanCacheEntry>>;

const CACHE_FILE_NAME = "plan-cache.json";

let cacheDirectory: string | null = null;
let cache: PlanCacheShape | null = null;

function cachePath() {
  return cacheDirectory ? path.join(cacheDirectory, CACHE_FILE_NAME) : null;
}

function loadCache(): PlanCacheShape {
  if (cache) {
    return cache;
  }

  const filePath = cachePath();
  if (!filePath || !existsSync(filePath)) {
    cache = {};
    return cache;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as PlanCacheShape;
    cache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function configurePlanCache(directory: string | null) {
  cacheDirectory = directory;
  cache = null;
}

export function readCachedPlanLabel(provider: ProviderId): string | undefined {
  const entry = loadCache()[provider];
  return typeof entry?.label === "string" && entry.label ? entry.label : undefined;
}

export function writeCachedPlanLabel(provider: ProviderId, label: string) {
  const current = loadCache();
  if (current[provider]?.label === label) {
    return;
  }

  current[provider] = { label, observedAt: new Date().toISOString() };
  const filePath = cachePath();
  if (!filePath) {
    return;
  }

  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(current, null, 2));
  } catch {
    // An unwritable cache only costs the badge after a restart.
  }
}
