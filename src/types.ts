/**
 * Shared type definitions for Iina Store.
 *
 * This file is the single source of truth for types shared between the
 * plugin entry script (src/*.ts, running inside IINA's JS engine) and the
 * two webview UIs (ui/window, ui/sidebar). The entry script and the
 * webviews run in separate JS contexts with no shared runtime -- only
 * JSON-serializable messages cross the boundary via postMessage/onMessage.
 * Keeping every shape here means both sides import from the same place
 * instead of drifting out of sync.
 */

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Plugin category, used for filtering/browsing the catalog. */
export type RegistryEntryCategory =
  | "subtitles"
  | "appearance"
  | "playback"
  | "automation"
  | "utility"
  | "other";

/** How a plugin's install artifact is obtained. */
export interface RegistryEntryInstall {
  type: "release-asset" | "codeload-fallback";
  /** Glob/regex-ish pattern used to pick the right asset off a GitHub release. */
  assetNamePattern?: string;
  /** Branch to fall back to when no release asset is available (codeload path). */
  defaultBranch?: string;
}

/** How update checks should be performed for a plugin. */
export interface RegistryEntryUpdate {
  mechanism: "ghVersion" | "gh-release-tag" | "none";
  /** "owner/repo" to query, when different from repo (rare, but allowed). */
  ghRepo?: string;
  /** Last known ghVersion integer, used to detect updates without a network call. */
  ghVersionKnown?: number;
}

/** Provenance/curation metadata for a registry entry. */
export interface RegistryEntrySource {
  type: "curated" | "crawled" | "user-submitted";
  curatorNote?: string | null;
  addedAt: string;
  lastVerifiedAt?: string;
}

/** A single plugin listing in the store's catalog. */
export interface RegistryEntry {
  /** Normalized lowercase id, e.g. "gh:owner/repo". */
  id: string;
  /** "owner/repo" as it appears on GitHub. */
  repo: string;
  repoUrl: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  category: RegistryEntryCategory;
  tags: string[];
  iconUrl: string | null;
  homepageUrl: string | null;
  license: string | null;
  identifier: string | null;
  install: RegistryEntryInstall;
  update: RegistryEntryUpdate;
  stars?: number;
  lastUpdated?: string;
  featured: boolean;
  verifiedInstallable: boolean;
  source: RegistryEntrySource;
}

/** The full registry payload, e.g. as fetched/bundled from the catalog source. */
export interface RegistryFile {
  schemaVersion: number;
  generatedAt: string;
  entries: RegistryEntry[];
}

// ---------------------------------------------------------------------------
// Installed plugin manifest
// ---------------------------------------------------------------------------

/** Record of a single plugin the store has installed on this machine. */
export interface InstalledManifestEntry {
  installedVersion: string;
  installedAt: string;
  installedIdentifier: string;
  folderName: string;
  sourceRepo: string;
  sourceType: "release-asset" | "codeload-fallback";
  installedFromUrl: string;
  ghVersionAtInstall?: number;
  managedByStore: true;
}

/** On-disk manifest tracking everything the store has installed. */
export interface InstalledManifest {
  schemaVersion: number;
  plugins: Record<string, InstalledManifestEntry>;
}

// ---------------------------------------------------------------------------
// Misc shared unions
// ---------------------------------------------------------------------------

export type InstallStatus = "not-installed" | "installed" | "update-available";

export type SortOption = "name" | "stars" | "recency" | "featured";

export type InstallProgressStage =
  | "resolving"
  | "downloading"
  | "extracting"
  | "validating"
  | "moving"
  | "confirming"
  | "removing"
  | "done"
  | "error";

// ---------------------------------------------------------------------------
// postMessage bridge protocol
// ---------------------------------------------------------------------------
//
// Requests are sent from a webview (ui/window, ui/sidebar) to the plugin
// entry script, each carrying a requestId so the reply can be matched back
// to the caller. Every request has a corresponding "<type>:reply" message.
// Events are one-directional, fire-and-forget push notifications from the
// entry script to a webview (no requestId, no reply expected).

/** List every entry currently in the catalog. */
export interface CatalogListRequest {
  type: "catalog:list";
  requestId: string;
  payload: {};
}

export interface CatalogListReply {
  type: "catalog:list:reply";
  requestId: string;
  ok: true;
  payload: {
    entries: RegistryEntry[];
    categories: string[];
    generatedAt: string;
    /** The user's "defaultSort" preference, so the window can seed its initial sort UI state. */
    defaultSort: SortOption;
  };
}

/** Search/filter/sort the catalog. */
export interface CatalogSearchRequest {
  type: "catalog:search";
  requestId: string;
  payload: {
    query: string;
    category?: string;
    tags?: string[];
    sort: SortOption;
  };
}

export interface CatalogSearchReply {
  type: "catalog:search:reply";
  requestId: string;
  ok: true;
  payload: {
    entries: RegistryEntry[];
  };
}

/** Fetch full detail plus install status for a single entry. */
export interface CatalogDetailRequest {
  type: "catalog:detail";
  requestId: string;
  payload: {
    id: string;
  };
}

export interface CatalogDetailReply {
  type: "catalog:detail:reply";
  requestId: string;
  ok: true;
  payload: {
    entry: RegistryEntry;
    status: InstallStatus;
    installedVersion?: string;
  };
}

/** Kick off an install for a given entry id. */
export interface InstallStartRequest {
  type: "install:start";
  requestId: string;
  payload: {
    id: string;
  };
}

/** Kick off an uninstall for a given entry id. */
export interface InstallUninstallRequest {
  type: "install:uninstall";
  requestId: string;
  payload: {
    id: string;
  };
}

/**
 * Reply to install:start or install:uninstall. Both are "accepted" replies --
 * the actual work is asynchronous and reported via InstallProgressEvent.
 */
export interface InstallAcceptedReply {
  type: "install:start:reply" | "install:uninstall:reply";
  requestId: string;
  ok: true;
  payload: {
    accepted: true;
  };
}

/** Batch-query install status for a set of entry ids. */
export interface InstallStatusRequest {
  type: "install:status";
  requestId: string;
  payload: {
    ids: string[];
  };
}

export interface InstallStatusReply {
  type: "install:status:reply";
  requestId: string;
  ok: true;
  payload: {
    statuses: Record<string, InstallStatus>;
  };
}

/** Ask the standalone window to focus/scroll to a given entry (e.g. from the sidebar). */
export interface WindowFocusEntryRequest {
  type: "window:focus-entry";
  requestId: string;
  payload: {
    id: string;
  };
}

export interface WindowFocusEntryReply {
  type: "window:focus-entry:reply";
  requestId: string;
  ok: true;
  payload: {};
}

/** Generic failure reply, usable in place of any of the `ok: true` replies above. */
export interface ErrorReply {
  type: string;
  requestId: string;
  ok: false;
  error: string;
}

/** Union of every request the webviews can send to the plugin entry script. */
export type BridgeRequest =
  | CatalogListRequest
  | CatalogSearchRequest
  | CatalogDetailRequest
  | InstallStartRequest
  | InstallUninstallRequest
  | InstallStatusRequest
  | WindowFocusEntryRequest;

/** Union of every reply the plugin entry script can send back. */
export type BridgeReply =
  | CatalogListReply
  | CatalogSearchReply
  | CatalogDetailReply
  | InstallAcceptedReply
  | InstallStatusReply
  | WindowFocusEntryReply
  | ErrorReply;

/** Progress update for an in-flight install/uninstall, pushed to the webview. */
export interface InstallProgressEvent {
  type: "event:install-progress";
  payload: {
    id: string;
    stage: InstallProgressStage;
    message?: string;
  };
}

/** Pushed when an entry should become the active selection (e.g. from the sidebar). */
export interface SelectEntryEvent {
  type: "event:select-entry";
  payload: {
    id: string;
  };
}

/** Union of every one-directional (non-request/reply) event on the bridge. */
export type BridgeEvent = InstallProgressEvent | SelectEntryEvent;
