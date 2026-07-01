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
  onOpenRepo: (url: string) => void;
}

/** Full detail panel for a single plugin: description, repo link, tags, install controls. */
const PluginDetail: React.FC<PluginDetailProps> = ({
  entry,
  status,
  progress,
  onInstall,
  onUninstall,
  onClose,
  onOpenRepo,
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
      {/*
        A plain target="_blank" link does nothing inside this embedded
        webview (confirmed live) -- there's no system browser hand-off
        without going through the entry script's iina.utils.open(). Kept
        as a real <a href> for hover/inspect/right-click-copy-link
        semantics, but the click itself is intercepted and routed through
        onOpenRepo instead of letting the webview handle it natively.
      */}
      <a
        className="plugin-detail__repo-link"
        href={entry.repoUrl}
        onClick={(event) => {
          event.preventDefault();
          onOpenRepo(entry.repoUrl);
        }}
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
