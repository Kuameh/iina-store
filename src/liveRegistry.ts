/**
 * Live registry overlay: fetches the Upstash-hosted registry blob (kept
 * fresh by scripts/crawl-registry.mjs running on a GitHub Actions schedule)
 * and merges it on top of the bundled resources/registry.json via
 * registry.ts's applyLiveOverlay().
 *
 * Every function here fails closed: a missing/invalid config, a network
 * error, an Upstash error response, or a JSON parse failure all result in
 * "do nothing, keep whatever registry.ts already has" rather than throwing.
 * The bundled catalog must always keep working even if this entire module
 * is broken or Upstash is unreachable -- that's the lesson from the
 * earlier iina.file.read() bug, applied defensively here too.
 */

import type { RegistryFile } from "./types";
import { applyLiveOverlay } from "./registry";
import {
  LIVE_REGISTRY_TTL_MS,
  REGISTRY_KEY,
  UPSTASH_READONLY_TOKEN,
  UPSTASH_REST_URL,
} from "./upstashConfig";

const CACHE_PATH = "@data/live-registry-cache.json";

interface CacheFile {
  fetchedAt: string;
  overlay: RegistryFile;
}

function isConfigured(): boolean {
  return (
    UPSTASH_REST_URL.startsWith("http") &&
    UPSTASH_READONLY_TOKEN.length > 0 &&
    !UPSTASH_READONLY_TOKEN.startsWith("REPLACE_")
  );
}

function readCacheFile(): CacheFile | null {
  try {
    const path = iina.utils.resolvePath(CACHE_PATH);
    if (!iina.file.exists(path)) {
      return null;
    }
    const raw = iina.file.read(path, {});
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.fetchedAt === "string" &&
      parsed.overlay &&
      Array.isArray(parsed.overlay.entries)
    ) {
      return parsed as CacheFile;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCacheFile(cache: CacheFile): void {
  try {
    const path = iina.utils.resolvePath(CACHE_PATH);
    iina.file.write(path, JSON.stringify(cache));
  } catch {
    // Best-effort only -- a failed cache write just means we'll refetch
    // sooner than the TTL would otherwise dictate. Not worth surfacing.
  }
}

/**
 * Synchronous, no network. Call once at plugin startup so a returning user
 * gets last session's live data immediately, before the async refresh below
 * has a chance to complete.
 */
export function loadCachedOverlayAtStartup(): void {
  if (!isConfigured()) {
    return;
  }
  const cache = readCacheFile();
  if (cache) {
    applyLiveOverlay(cache.overlay);
  }
}

async function fetchLiveOverlay(): Promise<RegistryFile | null> {
  const url = `${UPSTASH_REST_URL}/get/${REGISTRY_KEY}`;

  let response;
  try {
    response = await iina.http.get(url, {
      params: {},
      data: {},
      headers: { Authorization: `Bearer ${UPSTASH_READONLY_TOKEN}` },
    });
  } catch {
    return null;
  }

  if (!response || response.statusCode !== 200) {
    return null;
  }

  let body: any;
  try {
    body = response.data ?? JSON.parse(response.text);
  } catch {
    return null;
  }

  if (!body || typeof body.result !== "string") {
    // `result` is null when the key doesn't exist yet in Upstash -- not an
    // error, just "the crawler hasn't run yet" or "nothing to overlay."
    return null;
  }

  try {
    const overlay = JSON.parse(body.result) as RegistryFile;
    if (!Array.isArray(overlay.entries)) {
      return null;
    }
    return overlay;
  } catch {
    return null;
  }
}

/**
 * Refresh the live overlay if the local cache is missing or older than
 * LIVE_REGISTRY_TTL_MS. Returns true if a *new* overlay was fetched and
 * applied (i.e. the caller should tell the UI to re-query), false if
 * nothing changed (cache still fresh, not configured, or the fetch failed).
 */
export async function refreshLiveRegistry(): Promise<boolean> {
  if (!isConfigured()) {
    return false;
  }

  const cache = readCacheFile();
  if (cache) {
    const age = Date.now() - Date.parse(cache.fetchedAt);
    if (age >= 0 && age < LIVE_REGISTRY_TTL_MS) {
      return false;
    }
  }

  const overlay = await fetchLiveOverlay();
  if (!overlay) {
    return false;
  }

  applyLiveOverlay(overlay);
  writeCacheFile({ fetchedAt: new Date(Date.now()).toISOString(), overlay });
  return true;
}
