import React from "react";
import type { RegistryEntry, InstallStatus } from "../../../src/types";
import StatusBadge from "../../shared/components/StatusBadge";

export interface PluginCardProps {
  entry: RegistryEntry;
  status: InstallStatus;
  onOpenDetail: (id: string) => void;
}

/** Compact catalog card: name, tagline, category, tags, stars, install status. */
const PluginCard: React.FC<PluginCardProps> = ({ entry, status, onOpenDetail }) => {
  return (
    <div
      className="plugin-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(entry.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onOpenDetail(entry.id);
        }
      }}
    >
      <div className="plugin-card__header">
        <span className="plugin-card__name">{entry.name}</span>
        <StatusBadge status={status} />
      </div>
      <p className="plugin-card__tagline">{entry.tagline}</p>
      <div className="plugin-card__meta">
        <span className="plugin-card__category">{entry.category}</span>
        {typeof entry.stars === "number" && (
          <span className="plugin-card__stars">★ {entry.stars}</span>
        )}
      </div>
      {entry.tags.length > 0 && (
        <div className="plugin-card__tags">
          {entry.tags.map((tag) => (
            <span className="plugin-card__tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default PluginCard;
