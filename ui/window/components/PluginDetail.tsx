import React from "react";
import type { RegistryEntry, InstallStatus } from "../../../src/types";
import InstallButton, { InstallButtonProgress } from "./InstallButton";

export interface PluginDetailProps {
  entry: RegistryEntry;
  status: InstallStatus;
  progress?: InstallButtonProgress | null;
  onInstall: () => void;
  onUninstall: () => void;
  onClose: () => void;
}

/** Full detail panel for a single plugin: description, repo link, tags, install controls. */
const PluginDetail: React.FC<PluginDetailProps> = ({
  entry,
  status,
  progress,
  onInstall,
  onUninstall,
  onClose,
}) => {
  return (
    <div className="plugin-detail">
      <div className="plugin-detail__header">
        <h2 className="plugin-detail__title">{entry.name}</h2>
        <button type="button" className="plugin-detail__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <p className="plugin-detail__tagline">{entry.tagline}</p>
      <p className="plugin-detail__description">{entry.description}</p>
      <div className="plugin-detail__tags">
        {entry.tags.map((tag) => (
          <span className="plugin-detail__tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <a
        className="plugin-detail__repo-link"
        href={entry.repoUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {entry.repo}
      </a>
      {progress?.stage === "error" && (
        <p className="plugin-detail__error">
          {progress.message || "Install failed for an unknown reason."}
        </p>
      )}
      <div className="plugin-detail__actions">
        <InstallButton
          status={status}
          progress={progress}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />
      </div>
    </div>
  );
};

export default PluginDetail;
