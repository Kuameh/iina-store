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
 * The token below was verified against the live Upstash REST API before
 * being committed: a GET succeeded and a SET was rejected with NOPERM,
 * confirming it is genuinely read-only and safe to ship publicly.
 */

export const UPSTASH_REST_URL = "https://usable-monkfish-125318.upstash.io";

export const UPSTASH_READONLY_TOKEN =
  "ggAAAAAAAemGAAIgcDErSuMREHyQp3sQPQGn1e5ZSMfoB1oZi6j4WjSaHE2e1g";

/** Single Redis key holding the entire live-overlay RegistryFile as a JSON string. */
export const REGISTRY_KEY = "iina-store:registry:v1";

/** How long a locally-cached live overlay is trusted before refetching. */
export const LIVE_REGISTRY_TTL_MS = 12 * 60 * 60 * 1000;
