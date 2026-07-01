import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendRequest, subscribe, postOnly } from "../shared/bridge";
import type {
  RegistryEntry,
  InstallStatus,
  SortOption,
  CatalogListReply,
  CatalogSearchReply,
  InstallStatusReply,
  InstallProgressEvent,
  SelectEntryEvent,
  CatalogUpdatedEvent,
} from "../../src/types";
import SearchBar from "../shared/components/SearchBar";
import FilterChips from "./components/FilterChips";
import SortMenu from "./components/SortMenu";
import PluginGrid from "./components/PluginGrid";
import PluginDetail from "./components/PluginDetail";
import RestartPrompt from "./components/RestartPrompt";
import "./window.scss";

interface ProgressState {
  stage: string;
  message?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

const App: React.FC = () => {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("featured");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, InstallStatus>>({});
  const [progressByEntry, setProgressByEntry] = useState<Record<string, ProgressState>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch install/update status for a set of entry ids and merge it into
  // `statuses`. This has to be called explicitly after every entries load
  // -- catalog:list/catalog:search only return catalog metadata, not
  // status, so without this every plugin shows as "not-installed" on a
  // fresh page load (i.e. after every IINA restart) regardless of what
  // installed-manifest.json on disk actually says, since `statuses`
  // otherwise only ever gets populated reactively as install/uninstall
  // progress events complete in the current session.
  const refreshStatuses = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    sendRequest<InstallStatusReply>("install:status", { ids }).then((reply) => {
      setStatuses((prev) => ({ ...prev, ...reply.payload.statuses }));
    });
  }, []);

  // Initial catalog load. Seeds `sort` from the user's "defaultSort"
  // preference (read on the entry-script side, since this webview has no
  // direct access to iina.preferences) before the debounced search effect
  // below ever fires.
  useEffect(() => {
    sendRequest<CatalogListReply>("catalog:list", {}).then((reply) => {
      setEntries(reply.payload.entries);
      setCategories(reply.payload.categories);
      setSort(reply.payload.defaultSort);
      refreshStatuses(reply.payload.entries.map((entry) => entry.id));
    });
  }, []);

  // The entry script pushes this once a background live-registry refresh
  // (Upstash-backed, see src/liveRegistry.ts) has merged in new or updated
  // entries. Re-fetch categories silently; deliberately do NOT touch
  // `sort`/`query`/`category` here, since the user may already have set
  // those and a background data refresh shouldn't reset their filters.
  useEffect(() => {
    const unsubscribe = subscribe<CatalogUpdatedEvent["payload"]>(
      "event:catalog-updated",
      () => {
        sendRequest<CatalogListReply>("catalog:list", {}).then((reply) => {
          setCategories(reply.payload.categories);
          refreshStatuses(reply.payload.entries.map((entry) => entry.id));
        });
        setRefreshTick((tick) => tick + 1);
      },
    );
    return unsubscribe;
  }, [refreshStatuses]);

  // Debounced search/filter/sort refresh.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      sendRequest<CatalogSearchReply>("catalog:search", {
        query,
        category: category ?? undefined,
        sort,
      }).then((reply) => {
        setEntries(reply.payload.entries);
        refreshStatuses(reply.payload.entries.map((entry) => entry.id));
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, category, sort, refreshTick, refreshStatuses]);

  // Install/uninstall progress events.
  useEffect(() => {
    const unsubscribe = subscribe<InstallProgressEvent["payload"]>(
      "event:install-progress",
      (payload) => {
        setProgressByEntry((prev) => ({
          ...prev,
          [payload.id]: { stage: payload.stage, message: payload.message },
        }));

        if (payload.stage === "done") {
          refreshStatuses([payload.id]);
        }
      },
    );
    return unsubscribe;
  }, [refreshStatuses]);

  // Sidebar hand-off: focus a specific entry in this window.
  useEffect(() => {
    const unsubscribe = subscribe<SelectEntryEvent["payload"]>("event:select-entry", (payload) => {
      setSelectedEntryId(payload.id);
    });
    return unsubscribe;
  }, []);

  const handleInstall = useCallback((id: string) => {
    sendRequest("install:start", { id });
  }, []);

  const handleUninstall = useCallback((id: string) => {
    sendRequest("install:uninstall", { id });
  }, []);

  const handleRestartNow = useCallback(() => {
    postOnly("app:restart", {});
  }, []);

  const handleOpenRepo = useCallback((url: string) => {
    postOnly("app:open-url", { url });
  }, []);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const restartVisible = useMemo(
    () => Object.values(progressByEntry).some((progress) => progress.stage === "done"),
    [progressByEntry],
  );

  const [restartDismissed, setRestartDismissed] = useState(false);

  return (
    <div className="window-app">
      <div className="window-app__toolbar">
        <SearchBar value={query} onChange={setQuery} placeholder="Search plugins..." />
        <SortMenu value={sort} onChange={setSort} />
      </div>
      <FilterChips categories={categories} selected={category} onSelect={setCategory} />
      <RestartPrompt
        visible={restartVisible && !restartDismissed}
        onDismiss={() => setRestartDismissed(true)}
        onRestartNow={handleRestartNow}
      />
      <PluginGrid
        entries={entries}
        statuses={statuses}
        onOpenDetail={(id) => setSelectedEntryId(id)}
      />
      {selectedEntry && (
        <PluginDetail
          entry={selectedEntry}
          status={statuses[selectedEntry.id] ?? "not-installed"}
          progress={progressByEntry[selectedEntry.id] ?? null}
          onInstall={() => handleInstall(selectedEntry.id)}
          onUninstall={() => handleUninstall(selectedEntry.id)}
          onClose={() => setSelectedEntryId(null)}
          onOpenRepo={handleOpenRepo}
        />
      )}
    </div>
  );
};

export default App;
