import React from "react";

export interface FilterChipsProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

/** Clickable category chips, including an "All" chip that clears the selection. */
const FilterChips: React.FC<FilterChipsProps> = ({ categories, selected, onSelect }) => {
  return (
    <div className="filter-chips">
      <button
        type="button"
        className={"chip" + (selected === null ? " chip--active" : "")}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          type="button"
          key={category}
          className={"chip" + (selected === category ? " chip--active" : "")}
          onClick={() => onSelect(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
};

export default FilterChips;
