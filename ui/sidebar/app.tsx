import React, { useEffect, useRef, useState } from "react";
import { sendRequest, postOnly, subscribe } from "../shared/bridge";
import type {
  RegistryEntry,
  InstallStatus,
  CatalogSearchReply,
  CatalogUpdatedEvent,
} from "../../src/types";
import SearchBar from "../shared/components/SearchBar";
import StatusBadge from "../shared/components/StatusBadge";

const SEARCH_DEBOUNCE_MS = 250;

const App: React.FC = () => {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, InstallStatus>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      sendRequest<CatalogSearchReply>("catalog:search", {
        query,
        sort: "name",
      }).then((reply) => {
        setEntries(reply.payload.entries);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, refreshTick]);

  // Silently re-run the current search when the entry script reports a
  // live-registry refresh, so newly crawled/updated plugins show up
  // without the user needing to retype their search.
  useEffect(() => {
    const unsubscribe = subscribe<CatalogUpdatedEvent["payload"]>(
      "event:catalog-updated",
      () => setRefreshTick((tick) => tick + 1),
    );
    return unsubscribe;
  }, []);

  const handleRowClick = (id: string) => {
    postOnly("window:focus-entry", { id });
  };

  return (
    <div className="sidebar-app">
      <SearchBar value={query} onChange={setQuery} placeholder="Search plugins..." />
      <ul className="sidebar-list">
        {entries.map((entry) => (
          <li
            className="sidebar-row"
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => handleRowClick(entry.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleRowClick(entry.id);
              }
            }}
          >
            <div className="sidebar-row__main">
              <span className="sidebar-row__name">{entry.name}</span>
              <StatusBadge status={statuses[entry.id] ?? "not-installed"} />
            </div>
            <p className="sidebar-row__tagline">{entry.tagline}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default App;
