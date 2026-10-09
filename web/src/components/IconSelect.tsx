import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { controlClass } from "./Ui";

export type IconOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  group?: string;
};

export function IconSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: IconOption[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  let previousGroup = "";
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        className={`${controlClass} flex items-center gap-2 text-left`}
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.icon}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" aria-hidden>
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {options.map((option) => {
            const showGroup = Boolean(option.group) && option.group !== previousGroup;
            previousGroup = option.group ?? previousGroup;
            const active = option.value === value;
            return (
              <li key={`${option.group ?? ""}:${option.value}`}>
                {showGroup && <p className="px-3 pt-2 pb-1 text-xs text-muted">{option.group}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${active ? "bg-paper font-medium" : "hover:bg-paper"}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.icon ?? <span className="inline-block h-4 w-4 shrink-0" />}
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
