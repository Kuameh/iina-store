import React from "react";
import type { InstallStatus } from "../../../src/types";

export interface StatusBadgeProps {
  status: InstallStatus;
}

/**
 * Pure label showing install status. Renders nothing for "not-installed" --
 * this is not a button and has no click behavior.
 */
const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  if (status === "not-installed") {
    return null;
  }

  if (status === "update-available") {
    return <span className="status-badge status-badge--update">Update available</span>;
  }

  return <span className="status-badge status-badge--installed">Installed</span>;
};

export default StatusBadge;
