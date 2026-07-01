import React from "react";

export interface RestartPromptProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Dismissible banner nudging the user to restart IINA after install/uninstall. */
const RestartPrompt: React.FC<RestartPromptProps> = ({ visible, onDismiss }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="restart-prompt">
      <span>Restart IINA to finish installing or uninstalling plugins.</span>
      <button type="button" className="restart-prompt__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
};

export default RestartPrompt;
