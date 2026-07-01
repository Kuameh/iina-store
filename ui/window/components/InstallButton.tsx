import React from "react";
import type { InstallStatus, InstallProgressStage } from "../../../src/types";

export interface InstallButtonProgress {
  stage: string;
  message?: string;
}

export interface InstallButtonProps {
  status: InstallStatus;
  progress?: InstallButtonProgress | null;
  onInstall: () => void;
  onUninstall: () => void;
}

/** Human-readable, present-progressive label for an in-flight install stage. */
function describeStage(stage: string): string {
  const labels: Record<InstallProgressStage, string> = {
    resolving: "Resolving...",
    downloading: "Downloading...",
    extracting: "Extracting...",
    validating: "Validating...",
    moving: "Moving...",
    confirming: "Confirming...",
    removing: "Removing...",
    done: "Done",
    error: "Error",
  };
  return labels[stage as InstallProgressStage] ?? "Working...";
}

/**
 * Renders the install/update/uninstall affordance for a plugin. While an
 * install/uninstall is in flight (progress.stage not "done"/"error"), shows
 * a disabled button labelled with the current stage instead of the normal
 * status-driven label.
 */
const InstallButton: React.FC<InstallButtonProps> = ({ status, progress, onInstall, onUninstall }) => {
  if (progress && progress.stage !== "done" && progress.stage !== "error") {
    return (
      <button type="button" className="install-button install-button--busy" disabled>
        {describeStage(progress.stage)}
      </button>
    );
  }

  if (status === "update-available") {
    return (
      <div className="install-button-group">
        <button type="button" className="install-button install-button--update" onClick={onInstall}>
          Update
        </button>
        <button type="button" className="install-button__link" onClick={onUninstall}>
          Uninstall
        </button>
      </div>
    );
  }

  if (status === "installed") {
    return (
      <div className="install-button-group">
        <button type="button" className="install-button install-button--installed" disabled>
          Installed
        </button>
        <button type="button" className="install-button__link" onClick={onUninstall}>
          Uninstall
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="install-button install-button--install" onClick={onInstall}>
      Install
    </button>
  );
};

export default InstallButton;
