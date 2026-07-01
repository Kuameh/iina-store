/**
 * Plugin main entry point.
 *
 * Loads the two webview surfaces (standalone window + sidebar) and wires up
 * the postMessage bridge (see ui/shared/bridge.ts) between them and the
 * registry/installer modules. There is no video-overlay UI in this plugin,
 * so the "video-overlay" permission and all overlay wiring have been
 * removed entirely.
 *
 * Every bridge request type is handled by exactly one local function, and
 * that same function is registered as the handler for both
 * `standaloneWindow.onMessage` and `sidebar.onMessage`, so requests behave
 * identically regardless of which surface sent them. Replies are always
 * sent back on the surface the request arrived from; install/uninstall
 * progress events are always broadcast to both surfaces so they stay in
 * sync regardless of which one triggered the action.
 */

export {};

import { getEntryById, listCategories, searchRegistry } from "./registry";
import { getInstallStatus, installPlugin, uninstallPlugin } from "./installer";
import { loadCachedOverlayAtStartup, refreshLiveRegistry } from "./liveRegistry";
import {
  CatalogDetailReply,
  CatalogListReply,
  CatalogSearchReply,
  CatalogUpdatedEvent,
  ErrorReply,
  InstallAcceptedReply,
  InstallProgressEvent,
  InstallStatus,
  InstallStatusReply,
  RegistryEntry,
  SelectEntryEvent,
  SortOption,
} from "./types";

const { standaloneWindow, sidebar, event, console, menu, preferences } = iina;

const SORT_OPTIONS: SortOption[] = ["name", "stars", "recency", "featured"];

/** Whether the catalog should be filtered down to verifiedInstallable-only entries. */
function shouldShowOnlyVerified(): boolean {
  const value = preferences.get("showOnlyVerified");
  return value === undefined || value === null ? true : Boolean(value);
}

/** The user's preferred initial sort order, falling back to "featured". */
function getDefaultSort(): SortOption {
  const value = preferences.get("defaultSort");
  return SORT_OPTIONS.includes(value) ? (value as SortOption) : "featured";
}

/** Apply the showOnlyVerified preference to a set of search/list results. */
function applyVerifiedFilter(entries: RegistryEntry[]): RegistryEntry[] {
  return shouldShowOnlyVerified()
    ? entries.filter((entry) => entry.verifiedInstallable)
    : entries;
}

type Surface = IINA.API.StandaloneWindow | IINA.API.SidebarView;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function replyError(surface: Surface, type: string, requestId: string, err: unknown): void {
  const reply: ErrorReply = {
    type,
    requestId,
    ok: false,
    error: errorMessage(err),
  };
  surface.postMessage(type, reply);
}

function broadcastInstallProgress(id: string, stage: string, message?: string): void {
  const evt: InstallProgressEvent = {
    type: "event:install-progress",
    payload: { id, stage: stage as InstallProgressEvent["payload"]["stage"], message },
  };
  standaloneWindow.postMessage(evt.type, evt);
  sidebar.postMessage(evt.type, evt);
}

function broadcastCatalogUpdated(): void {
  const evt: CatalogUpdatedEvent = { type: "event:catalog-updated", payload: {} };
  standaloneWindow.postMessage(evt.type, evt);
  sidebar.postMessage(evt.type, evt);
}

// ---------------------------------------------------------------------------
// Request handlers -- one per bridge request type, shared by both surfaces.
// ---------------------------------------------------------------------------

function handleCatalogList(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "catalog:list:reply";
  try {
    const entries = applyVerifiedFilter(searchRegistry({}));
    const categories = listCategories();
    const reply: CatalogListReply = {
      type: replyType,
      requestId,
      ok: true,
      payload: {
        entries,
        categories,
        generatedAt: new Date(Date.now()).toISOString(),
        defaultSort: getDefaultSort(),
      },
    };
    surface.postMessage(replyType, reply);
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleCatalogSearch(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "catalog:search:reply";
  try {
    const payload = data?.payload ?? {};
    const entries = applyVerifiedFilter(
      searchRegistry({
        query: payload.query,
        category: payload.category,
        tags: payload.tags,
        sort: payload.sort as SortOption | undefined,
      }),
    );
    const reply: CatalogSearchReply = {
      type: replyType,
      requestId,
      ok: true,
      payload: { entries },
    };
    surface.postMessage(replyType, reply);
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleCatalogDetail(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "catalog:detail:reply";
  try {
    const id = data?.payload?.id;
    const entry = getEntryById(id);
    if (!entry) {
      throw new Error(`Unknown catalog entry id: "${id}"`);
    }
    getInstallStatus(entry).then((status) => {
      const reply: CatalogDetailReply = {
        type: replyType,
        requestId,
        ok: true,
        payload: { entry, status },
      };
      surface.postMessage(replyType, reply);
    }, (err) => {
      replyError(surface, replyType, requestId, err);
    });
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleInstallStart(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "install:start:reply";
  try {
    const id = data?.payload?.id;
    const entry = getEntryById(id);
    if (!entry) {
      throw new Error(`Unknown catalog entry id: "${id}"`);
    }

    const reply: InstallAcceptedReply = {
      type: replyType,
      requestId,
      ok: true,
      payload: { accepted: true },
    };
    surface.postMessage(replyType, reply);

    installPlugin(entry, (stage, message) => {
      broadcastInstallProgress(id, stage, message);
    }).catch((err) => {
      console.log(`install:start failed for ${id}: ${errorMessage(err)}`);
    });
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleInstallUninstall(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "install:uninstall:reply";
  try {
    const id = data?.payload?.id;
    if (!id) {
      throw new Error("install:uninstall requires a payload.id");
    }

    const reply: InstallAcceptedReply = {
      type: replyType,
      requestId,
      ok: true,
      payload: { accepted: true },
    };
    surface.postMessage(replyType, reply);

    uninstallPlugin(id, (stage, message) => {
      broadcastInstallProgress(id, stage, message);
    }).catch((err) => {
      console.log(`install:uninstall failed for ${id}: ${errorMessage(err)}`);
    });
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleInstallStatus(surface: Surface, data: any): void {
  const requestId = data?.requestId;
  const replyType = "install:status:reply";
  try {
    const ids: string[] = data?.payload?.ids ?? [];
    const statuses: Record<string, InstallStatus> = {};

    Promise.all(
      ids.map(async (id) => {
        const entry = getEntryById(id);
        statuses[id] = entry ? await getInstallStatus(entry) : "not-installed";
      }),
    ).then(() => {
      const reply: InstallStatusReply = {
        type: replyType,
        requestId,
        ok: true,
        payload: { statuses },
      };
      surface.postMessage(replyType, reply);
    }, (err) => {
      replyError(surface, replyType, requestId, err);
    });
  } catch (err) {
    replyError(surface, replyType, requestId, err);
  }
}

function handleWindowFocusEntry(_surface: Surface, data: any): void {
  // Sent fire-and-forget (postOnly) from the sidebar; no reply expected.
  try {
    const id = data?.payload?.id ?? data?.id;
    if (!id) {
      throw new Error("window:focus-entry requires an id");
    }
    standaloneWindow.open();
    const evt: SelectEntryEvent = {
      type: "event:select-entry",
      payload: { id },
    };
    standaloneWindow.postMessage(evt.type, evt);
  } catch (err) {
    console.log(`window:focus-entry failed: ${errorMessage(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Registration -- identical handlers wired to both surfaces.
// ---------------------------------------------------------------------------

function registerHandlers(surface: Surface): void {
  surface.onMessage("catalog:list", (data: any) => handleCatalogList(surface, data));
  surface.onMessage("catalog:search", (data: any) => handleCatalogSearch(surface, data));
  surface.onMessage("catalog:detail", (data: any) => handleCatalogDetail(surface, data));
  surface.onMessage("install:start", (data: any) => handleInstallStart(surface, data));
  surface.onMessage("install:uninstall", (data: any) => handleInstallUninstall(surface, data));
  surface.onMessage("install:status", (data: any) => handleInstallStatus(surface, data));
  surface.onMessage("window:focus-entry", (data: any) => handleWindowFocusEntry(surface, data));
}

console.log("Plugin is running");

// Apply whatever live overlay was cached from last session immediately
// (synchronous, no network), so a returning user doesn't wait on a fetch
// before seeing last-known-fresh data. The async refresh below then checks
// whether that cache is stale and, if so, fetches a new one from Upstash --
// but if Upstash is unreachable or unconfigured, this all silently no-ops
// and the plugin behaves exactly as it did before this feature existed.
loadCachedOverlayAtStartup();

standaloneWindow.loadFile("dist/ui/window/index.html");

menu.addItem(
  menu.item("Show Window", () => {
    standaloneWindow.open();
  }),
);

registerHandlers(standaloneWindow);
registerHandlers(sidebar);

event.on("iina.window-loaded", () => {
  sidebar.loadFile("dist/ui/sidebar/index.html");
});

refreshLiveRegistry().then((changed) => {
  if (changed) {
    broadcastCatalogUpdated();
  }
}).catch((err) => {
  console.log(`refreshLiveRegistry failed: ${errorMessage(err)}`);
});
