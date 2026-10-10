import { useState } from "react";

export type SortDirection = "asc" | "desc";

export function useColumnSort<Key extends string>(initialKey: Key, initialDirection: SortDirection = "asc") {
  const [key, setKey] = useState<Key>(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  function toggle(next: Key) {
    if (next === key) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setKey(next);
    setDirection("asc");
  }

  return { key, direction, toggle };
}

export function SortHeader({
  label,
  active,
  direction,
  align = "left",
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th
      className={`border border-line px-2 py-1.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className={`flex w-full cursor-pointer items-center gap-1 ${align === "right" ? "justify-end" : ""}`} onClick={onClick}>
        {label}
        <span className="text-xs text-muted" aria-hidden="true">
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function compareColumn(left: string | number, right: string | number, direction: SortDirection): number {
  const leftEmpty = left === "" || left == null;
  const rightEmpty = right === "" || right == null;
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ko");
  return direction === "asc" ? order : -order;
}
