import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  children: (item: T) => ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const orderRef = useRef(items);
  const listRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const dirty = useRef(false);
  orderRef.current = order;

  useEffect(() => {
    if (!dragId.current) setOrder(items);
  }, [items]);

  function move(clientY: number) {
    const id = dragId.current;
    const list = listRef.current;
    if (!id || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>("[data-sort-id]")];
    const from = rows.findIndex((row) => row.dataset.sortId === id);
    if (from < 0) return;
    let to = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const box = rows[index].getBoundingClientRect();
      if (clientY > box.top + box.height / 2) to = index;
    }
    if (from === to) return;
    const next = orderRef.current.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    orderRef.current = next;
    dirty.current = true;
    setOrder(next);
  }

  function start(id: string, event: ReactPointerEvent) {
    event.preventDefault();
    dragId.current = id;
    dirty.current = false;
    const pointer = event.pointerId;
    const finish = () => {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const current = dragId.current;
      dragId.current = null;
      if (current && dirty.current) onReorder(orderRef.current.map((item) => item.id));
    };
    const moved = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      move(ev.clientY);
    };
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  return (
    <div ref={listRef} className="space-y-3">
      {order.map((item) => (
        <div key={item.id} data-sort-id={item.id} className={dragId.current === item.id ? "opacity-70" : undefined}>
          <div className="flex items-start gap-2">
            <button
              type="button"
              aria-label="순서 바꾸기"
              className="mt-4 cursor-grab touch-none select-none rounded-md px-1 text-lg leading-none text-muted active:cursor-grabbing"
              onPointerDown={(event) => start(item.id, event)}
            >
              ⋮⋮
            </button>
            <div className="min-w-0 flex-1">{children(item)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
