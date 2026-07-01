import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendRequest, subscribe } from "../shared/bridge";
import type {
  RegistryEntry,
  InstallStatus,
  SortOption,
  CatalogListReply,
  CatalogSearchReply,
  InstallStatusReply,
  InstallProgressEvent,
  SelectEntryEvent,
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial catalog load. Seeds `sort` from the user's "defaultSort"
  // preference (read on the entry-script side, since this webview has no
  // direct access to iina.preferences) before the debounced search effect
  // below ever fires.
  useEffect(() => {
    sendRequest<CatalogListReply>("catalog:list", {}).then((reply) => {
      setEntries(reply.payload.entries);
      setCategories(reply.payload.categories);
      setSort(reply.payload.defaultSort);
    });
  }, []);

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
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, category, sort]);

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
          sendRequest<InstallStatusReply>("install:status", { ids: [payload.id] }).then(
            (reply) => {
              setStatuses((prev) => ({ ...prev, ...reply.payload.statuses }));
            },
          );
        }
      },
    );
    return unsubscribe;
  }, []);

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
        />
      )}
    </div>
  );
};

export default App;
