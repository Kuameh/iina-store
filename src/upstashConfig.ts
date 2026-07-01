/**
 * Upstash Redis connection details for the live registry overlay.
 *
 * This token is intentionally the READ-ONLY Upstash REST token, not the
 * full-access one -- it ships inside dist/index.js to every user who
 * installs this plugin, so it must never be able to write. The matching
 * read-write token lives only in this repo's GitHub Actions secrets
 * (UPSTASH_REDIS_REST_WRITE_TOKEN), used exclusively by
 * scripts/crawl-registry.mjs, and is never embedded in plugin code.
 *
 * TODO: replace the two placeholder values below with the real Upstash
 * REST URL and read-only token before building/shipping a release --
 * until then, liveRegistry.ts's fetches will fail closed (caught, logged,
 * ignored) and the plugin simply falls back to the bundled registry, same
 * as before this feature existed.
 */

export const UPSTASH_REST_URL = "REPLACE_WITH_UPSTASH_REST_URL";

export const UPSTASH_READONLY_TOKEN = "REPLACE_WITH_UPSTASH_READONLY_TOKEN";

/** Single Redis key holding the entire live-overlay RegistryFile as a JSON string. */
export const REGISTRY_KEY = "iina-store:registry:v1";

/** How long a locally-cached live overlay is trusted before refetching. */
export const LIVE_REGISTRY_TTL_MS = 12 * 60 * 60 * 1000;
