/**
 * Registry/catalog access layer.
 *
 * v2 extension point: all registry access in this codebase goes through
 * `searchRegistry` and `getEntryById` below -- nowhere else reaches into the
 * registry data directly. That means a future live GitHub-topic-crawl
 * feature can swap the internal data source (this bundled
 * resources/registry.json becoming a merge of the bundled snapshot plus
 * periodically refreshed crawl results, cached via iina.file) entirely
 * inside `loadRegistry` below, without changing either function's signature
 * or touching any caller.
 */

import type { RegistryEntry, RegistryFile, SortOption } from "./types";

// Presence of this export makes TypeScript treat the file as a module
// (isolated scope) instead of a global script, so it doesn't collide with
// other entry files sharing the same global scope. It has no effect on the
// bundled/runtime output.
export {};

// Module-level cache, populated lazily on first call into loadRegistry().
// Deliberately not populated at module top level: iina may not be ready at
// pure import time, so the one iina.file.read() call in this file is
// deferred until something actually needs the registry.
let cachedRegistry: RegistryFile | undefined;

/**
 * Reads and parses the bundled resources/registry.json.
 *
 * The path passed to iina.file.read() ("resources/registry.json") is
 * relative to the plugin package root. That relative-path resolution
 * behavior is a reasonable assumption based on how other plugin file paths
 * are documented, but it has not been verified against a running IINA
 * instance -- if plugin-root-relative resolution turns out to work
 * differently, only this function needs to change.
 */
function loadRegistry(): RegistryFile {
  if (cachedRegistry !== undefined) {
    return cachedRegistry;
  }

  const raw = iina.file.read("resources/registry.json", {});
  if (raw === undefined) {
    throw new Error(
      "registry: failed to read resources/registry.json via iina.file.read",
    );
  }

  cachedRegistry = JSON.parse(raw) as RegistryFile;
  return cachedRegistry;
}

/** Look up a single catalog entry by its registry id (e.g. "gh:owner/repo"). */
export function getEntryById(id: string): RegistryEntry | undefined {
  return loadRegistry().entries.find((entry) => entry.id === id);
}

export interface SearchRegistryOptions {
  query?: string;
  category?: string;
  tags?: string[];
  sort?: SortOption;
}

/**
 * Score a single entry against a (non-empty, already-lowercased) query.
 * name: 3, tagline: 2, description or tags: 1. Returns 0 for no match.
 */
function scoreEntry(entry: RegistryEntry, query: string): number {
  let score = 0;
  if (entry.name.toLowerCase().includes(query)) {
    score += 3;
  }
  if (entry.tagline.toLowerCase().includes(query)) {
    score += 2;
  }
  if (entry.description.toLowerCase().includes(query)) {
    score += 1;
  }
  if (entry.tags.join(" ").toLowerCase().includes(query)) {
    score += 1;
  }
  return score;
}

function compareByName(a: RegistryEntry, b: RegistryEntry): number {
  return a.name.localeCompare(b.name);
}

function compareByStars(a: RegistryEntry, b: RegistryEntry): number {
  if (a.stars == null && b.stars == null) return 0;
  if (a.stars == null) return 1;
  if (b.stars == null) return -1;
  return b.stars - a.stars;
}

function compareByRecency(a: RegistryEntry, b: RegistryEntry): number {
  if (a.lastUpdated == null && b.lastUpdated == null) return 0;
  if (a.lastUpdated == null) return 1;
  if (b.lastUpdated == null) return -1;
  return b.lastUpdated.localeCompare(a.lastUpdated);
}

function compareByFeatured(a: RegistryEntry, b: RegistryEntry): number {
  if (a.featured !== b.featured) {
    return a.featured ? -1 : 1;
  }
  return compareByName(a, b);
}

function comparatorFor(
  sort: SortOption,
): (a: RegistryEntry, b: RegistryEntry) => number {
  switch (sort) {
    case "name":
      return compareByName;
    case "stars":
      return compareByStars;
    case "recency":
      return compareByRecency;
    case "featured":
      return compareByFeatured;
  }
}

/**
 * Search/filter/sort the catalog.
 *
 * - `query` (case-insensitive substring match against name, tagline,
 *   description, and tags joined by a space) scores each entry and drops
 *   zero-score entries, but only when the query is non-empty.
 * - `category` filters to an exact match when provided.
 * - `tags` filters to entries containing ALL of the given tags when provided.
 * - `sort` defaults to "featured" when not provided.
 */
export function searchRegistry(opts: SearchRegistryOptions): RegistryEntry[] {
  const { entries } = loadRegistry();
  const query = opts.query?.trim().toLowerCase() ?? "";

  let results = entries;

  if (query.length > 0) {
    results = results.filter((entry) => scoreEntry(entry, query) > 0);
  }

  if (opts.category !== undefined) {
    results = results.filter((entry) => entry.category === opts.category);
  }

  if (opts.tags !== undefined && opts.tags.length > 0) {
    const wanted = opts.tags;
    results = results.filter((entry) =>
      wanted.every((tag) => entry.tags.includes(tag)),
    );
  }

  const sort = opts.sort ?? "featured";
  return [...results].sort(comparatorFor(sort));
}

/** Distinct categories present in the loaded registry. */
export function listCategories(): string[] {
  const { entries } = loadRegistry();
  const categories = new Set<string>();
  for (const entry of entries) {
    categories.add(entry.category);
  }
  return [...categories];
}
