import React from "react";
import type { RegistryEntry, InstallStatus } from "../../../src/types";
import PluginCard from "./PluginCard";

export interface PluginGridProps {
  entries: RegistryEntry[];
  statuses: Record<string, InstallStatus>;
  onOpenDetail: (id: string) => void;
}

/** Responsive grid of PluginCard tiles. */
const PluginGrid: React.FC<PluginGridProps> = ({ entries, statuses, onOpenDetail }) => {
  return (
    <div className="plugin-grid">
      {entries.map((entry) => (
        <PluginCard
          key={entry.id}
          entry={entry}
          status={statuses[entry.id] ?? "not-installed"}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
};

export default PluginGrid;
