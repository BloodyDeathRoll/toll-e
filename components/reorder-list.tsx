'use client';

import { useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Drag {
  from: number;
  to: number;
  /** Pointer travel since the grab, in px. */
  dy: number;
  /** Height of the row being dragged — what the rows it passes give up. */
  height: number;
}

/**
 * A list whose rows are dragged by a grip to reorder them.
 *
 * Built on pointer events, not HTML5 drag-and-drop: dragstart/drop never fire
 * from a touch, which made reordering a desktop-only feature on a phone-only
 * app. Pointer events cover finger, pen and mouse in one path.
 *
 * The grip also takes arrow keys, so the list can be reordered without a
 * pointer at all.
 *
 * Row geometry is measured once, at the grab: rows move under `transform`
 * during the drag, so their live rects would chase the animation.
 */
export function ReorderList<T>({
  items,
  keyOf,
  onReorder,
  handleLabel,
  rowClassName,
  className,
  children,
}: {
  items: T[];
  keyOf: (item: T, index: number) => string;
  /** Commit a move. Called once, when the row is dropped. */
  onReorder: (from: number, to: number) => void;
  /** Accessible name for a row's grip, e.g. "Reorder NVDA". */
  handleLabel: (item: T, index: number) => string;
  rowClassName?: (index: number) => string;
  className?: string;
  children: (item: T, index: number) => React.ReactNode;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = useRef<Array<HTMLLIElement | null>>([]);
  const grab = useRef<{ y: number; rects: DOMRect[] } | null>(null);

  const onPointerDown = (from: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    // Ignore secondary buttons; a right-click should not start a drag.
    if (e.button !== 0) return;
    const rects = rows.current.slice(0, items.length).map((el) => el?.getBoundingClientRect());
    if (rects.some((r) => !r)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { y: e.clientY, rects: rects as DOMRect[] };
    setDrag({ from, to: from, dy: 0, height: (rects[from] as DOMRect).height });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = grab.current;
    if (!drag || !start) return;
    const dy = e.clientY - start.y;
    const rects = start.rects;
    const centre = rects[drag.from].top + rects[drag.from].height / 2 + dy;
    let to = drag.from;
    if (centre <= rects[0].top) to = 0;
    else if (centre >= rects[rects.length - 1].bottom) to = rects.length - 1;
    else {
      const hit = rects.findIndex((r) => centre >= r.top && centre <= r.bottom);
      if (hit !== -1) to = hit;
    }
    setDrag({ ...drag, dy, to });
  };

  const end = () => {
    if (drag && drag.to !== drag.from) onReorder(drag.from, drag.to);
    grab.current = null;
    setDrag(null);
  };

  /** Where row `i` sits while a drag is in flight. */
  const shift = (i: number) => {
    if (!drag) return undefined;
    const { from, to, dy, height } = drag;
    if (i === from) return `translateY(${dy}px)`;
    if (from < to && i > from && i <= to) return `translateY(${-height}px)`;
    if (to < from && i >= to && i < from) return `translateY(${height}px)`;
    return undefined;
  };

  return (
    <ul className={cn(drag && 'select-none', className)}>
      {items.map((item, i) => (
        <li
          key={keyOf(item, i)}
          ref={(el) => {
            rows.current[i] = el;
          }}
          style={{ transform: shift(i) }}
          className={cn(
            rowClassName?.(i),
            drag?.from === i
              ? 'relative z-10 rounded-lg bg-card shadow-lg'
              : 'transition-transform duration-150',
          )}
        >
          <button
            type="button"
            aria-label={handleLabel(item, i)}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && i > 0) {
                e.preventDefault();
                onReorder(i, i - 1);
              }
              if (e.key === 'ArrowDown' && i < items.length - 1) {
                e.preventDefault();
                onReorder(i, i + 1);
              }
            }}
            // touch-none: the grip owns the gesture, so the page underneath
            // does not scroll away while a row is being moved.
            className="shrink-0 cursor-grab touch-none text-faint active:cursor-grabbing"
          >
            <GripHorizontal className="size-4" aria-hidden />
          </button>
          {children(item, i)}
        </li>
      ))}
    </ul>
  );
}
