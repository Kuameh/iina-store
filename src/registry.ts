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
import registryJson from "../resources/registry.json";

// Presence of this export makes TypeScript treat the file as a module
// (isolated scope) instead of a global script, so it doesn't collide with
// other entry files sharing the same global scope. It has no effect on the
// bundled/runtime output.
export {};

/**
 * The curated catalog is static data shipped with the plugin, so it is
 * imported directly at build time (Parcel inlines JSON imports into the
 * bundle) rather than read at runtime via iina.file.read(). An earlier
 * version of this file tried the runtime-read approach with a plain
 * relative path ("resources/registry.json"), and that path resolution
 * turned out not to work against a live IINA instance -- the catalog came
 * back empty. Importing the JSON removes that runtime path-resolution
 * question entirely: this data is simply part of the compiled dist/index.js
 * bundle, no file I/O involved.
 *
 * The cast is `as unknown as RegistryFile` because TypeScript infers plain
 * `string` for the JSON's enum-like fields (e.g. category, install.type)
 * rather than the narrower literal unions declared in RegistryEntry -- the
 * actual JSON contents are still validated by the registry-build tooling
 * and Info.json-identifier cross-checks in installer.ts at install time.
 */
const cachedRegistry = registryJson as unknown as RegistryFile;

function loadRegistry(): RegistryFile {
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
