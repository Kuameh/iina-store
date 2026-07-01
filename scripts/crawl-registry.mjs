#!/usr/bin/env node
/**
 * Scheduled crawler for the Iina Store live registry overlay.
 *
 * Runs in GitHub Actions (see .github/workflows/crawl-registry.yml), NOT
 * inside the IINA plugin itself -- centralizing the crawl here means every
 * user's plugin instance just does one cheap Upstash read (src/liveRegistry.ts)
 * instead of every installation separately hammering GitHub's search API
 * and needing its own GitHub token.
 *
 * What it does:
 *   1. Reads the current live-overlay RegistryFile from Upstash (or starts
 *      from an empty one if the key has never been set).
 *   2. Searches GitHub for repos tagged with the "iina-plugin" topic.
 *   3. Upserts each result into the registry:
 *      - same-id, source.type "curated" -> only refresh stars/lastUpdated/lastSeenAt,
 *        never touch curator-authored fields (name, tagline, description,
 *        tags, category, install, update.mechanism, featured, curatorNote).
 *      - same-id, source.type "crawled" -> refresh descriptive fields freely.
 *      - no existing entry               -> add as a new "crawled" entry,
 *        best-effort checking its latest release for a .iinaplgz asset.
 *   4. Writes the merged registry back to Upstash as a single JSON blob.
 *
 * Required environment variables:
 *   GITHUB_TOKEN                     (auto-provided by GitHub Actions)
 *   UPSTASH_REDIS_REST_URL           (repo secret, set by the maintainer)
 *   UPSTASH_REDIS_REST_WRITE_TOKEN   (repo secret, full-access token --
 *                                     never the same token embedded in the
 *                                     plugin bundle)
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_WRITE_TOKEN = process.env.UPSTASH_REDIS_REST_WRITE_TOKEN;
const REGISTRY_KEY = "iina-store:registry:v1";
const TOPIC = "iina-plugin";

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

requireEnv("GITHUB_TOKEN", GITHUB_TOKEN);
requireEnv("UPSTASH_REDIS_REST_URL", UPSTASH_URL);
requireEnv("UPSTASH_REDIS_REST_WRITE_TOKEN", UPSTASH_WRITE_TOKEN);

function nowIso() {
  return new Date().toISOString();
}

async function upstashGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_WRITE_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Upstash GET ${key} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`Upstash GET ${key} returned an error: ${body.error}`);
  }
  return body.result; // string | null
}

async function upstashSet(key, value) {
  const res = await fetch(`${UPSTASH_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_WRITE_TOKEN}` },
    body: value,
  });
  if (!res.ok) {
    throw new Error(`Upstash SET ${key} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`Upstash SET ${key} returned an error: ${body.error}`);
  }
}

async function githubApi(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Best-effort: find a .iinaplgz asset on the repo's latest release. Never throws. */
async function findIinaplgzAsset(fullName) {
  try {
    const release = await githubApi(`/repos/${fullName}/releases/latest`);
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const match = assets.find((a) => typeof a?.name === "string" && a.name.endsWith(".iinaplgz"));
    return match ? true : false;
  } catch {
    return false;
  }
}

function buildCrawledEntry(item, hasReleaseAsset) {
  const id = `gh:${item.full_name.toLowerCase()}`;
  const description = item.description || "";
  return {
    id,
    repo: item.full_name,
    repoUrl: item.html_url,
    name: item.name,
    tagline: description.slice(0, 120),
    description,
    author: item.owner?.login || "",
    category: "other",
    tags: Array.isArray(item.topics) ? item.topics.filter((t) => t !== TOPIC) : [],
    iconUrl: null,
    homepageUrl: item.homepage || null,
    license: item.license?.spdx_id || null,
    identifier: null,
    install: hasReleaseAsset
      ? { type: "release-asset", assetNamePattern: "*.iinaplgz" }
      : { type: "codeload-fallback", defaultBranch: item.default_branch || "main" },
    update: { mechanism: "none" },
    stars: item.stargazers_count,
    lastUpdated: item.pushed_at,
    featured: false,
    verifiedInstallable: false,
    source: {
      type: "crawled",
      curatorNote: null,
      addedAt: nowIso(),
      lastSeenAt: nowIso(),
    },
  };
}

function refreshCuratedEntry(existing, item) {
  return {
    ...existing,
    stars: item.stargazers_count,
    lastUpdated: item.pushed_at,
    source: { ...existing.source, lastSeenAt: nowIso() },
  };
}

function refreshCrawledEntry(existing, item) {
  const description = item.description || "";
  return {
    ...existing,
    name: item.name,
    tagline: description.slice(0, 120),
    description,
    tags: Array.isArray(item.topics) ? item.topics.filter((t) => t !== TOPIC) : existing.tags,
    homepageUrl: item.homepage || existing.homepageUrl,
    license: item.license?.spdx_id || existing.license,
    stars: item.stargazers_count,
    lastUpdated: item.pushed_at,
    source: { ...existing.source, lastSeenAt: nowIso() },
  };
}

async function main() {
  console.log(`Fetching current registry from Upstash key "${REGISTRY_KEY}"...`);
  const raw = await upstashGet(REGISTRY_KEY);
  let registry = { schemaVersion: 1, generatedAt: nowIso(), entries: [] };
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        registry = parsed;
      } else {
        console.warn("Existing Upstash value did not look like a RegistryFile; starting fresh.");
      }
    } catch (err) {
      console.error(`Existing Upstash value is not valid JSON, aborting rather than overwriting it: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log("No existing registry found at that key -- starting from an empty one.");
  }

  const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));

  console.log(`Searching GitHub for repositories tagged "${TOPIC}"...`);
  const search = await githubApi(`/search/repositories?q=topic:${TOPIC}&per_page=100`);
  const items = Array.isArray(search.items) ? search.items : [];
  console.log(`GitHub reports ${search.total_count} total match(es); processing ${items.length} in this run.`);

  let added = 0;
  let refreshedCurated = 0;
  let refreshedCrawled = 0;

  for (const item of items) {
    if (!item?.full_name) continue;
    const id = `gh:${item.full_name.toLowerCase()}`;
    const existing = byId.get(id);

    if (!existing) {
      const hasReleaseAsset = await findIinaplgzAsset(item.full_name);
      byId.set(id, buildCrawledEntry(item, hasReleaseAsset));
      added++;
    } else if (existing.source?.type === "curated") {
      byId.set(id, refreshCuratedEntry(existing, item));
      refreshedCurated++;
    } else {
      byId.set(id, refreshCrawledEntry(existing, item));
      refreshedCrawled++;
    }
  }

  const merged = {
    schemaVersion: registry.schemaVersion || 1,
    generatedAt: nowIso(),
    entries: Array.from(byId.values()),
  };

  console.log(
    `Writing merged registry back to Upstash: ${merged.entries.length} total entries ` +
      `(${added} newly discovered, ${refreshedCurated} curated refreshed, ${refreshedCrawled} crawled refreshed).`,
  );
  await upstashSet(REGISTRY_KEY, JSON.stringify(merged));
  console.log("Done.");
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
