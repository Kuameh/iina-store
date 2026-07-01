import React from "react";

export interface RestartPromptProps {
  visible: boolean;
  onDismiss: () => void;
  onRestartNow: () => void;
}

/**
 * Dismissible banner nudging the user to restart IINA after install/
 * uninstall, with a one-click "Restart IINA Now" action. Rendered as a
 * fixed, high-z-index overlay (see window.scss) rather than inline in the
 * normal document flow -- PluginDetail is a fixed full-height panel that
 * is always open at the moment an install/uninstall completes (that's
 * where the Install/Uninstall button lives), and an inline banner further
 * up the page was getting visually covered by it.
 */
const RestartPrompt: React.FC<RestartPromptProps> = ({ visible, onDismiss, onRestartNow }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="restart-prompt">
      <span>
        Restart IINA to finish installing or uninstalling plugins. After
        restarting, open IINA's Preferences &rarr; Plugins and make sure the
        new plugin is enabled &mdash; newly installed plugins aren't turned
        on automatically.
      </span>
      <div className="restart-prompt__actions">
        <button type="button" className="restart-prompt__restart" onClick={onRestartNow}>
          Restart IINA Now
        </button>
        <button type="button" className="restart-prompt__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default RestartPrompt;
