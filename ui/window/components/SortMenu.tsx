import React from "react";
import type { SortOption } from "../../../src/types";

export interface SortMenuProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "stars", label: "Stars" },
  { value: "recency", label: "Recently updated" },
  { value: "featured", label: "Featured" },
];

/** Select element for choosing the catalog sort order. */
const SortMenu: React.FC<SortMenuProps> = ({ value, onChange }) => {
  return (
    <select
      className="sort-menu"
      value={value}
      onChange={(event) => onChange(event.target.value as SortOption)}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default SortMenu;
