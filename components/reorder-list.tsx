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

/** How close to an edge the finger has to be before the list scrolls itself. */
const EDGE = 64;
/** Fastest auto-scroll, in px per frame. */
const MAX_SPEED = 16;

/** The scroller the list lives in — an ancestor with its own overflow, else the page. */
function scrollerFor(el: HTMLElement | null): HTMLElement | Window {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return window;
}

const scrollTopOf = (s: HTMLElement | Window) =>
  s instanceof Window ? s.scrollY : s.scrollTop;

/** The band of the viewport the scroller shows, in client coordinates. */
const viewportOf = (s: HTMLElement | Window) => {
  if (s instanceof Window) return { top: 0, bottom: s.innerHeight };
  const r = s.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
};

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
 * Holding a row against the top or bottom edge scrolls the list under it, so
 * a move from one end to the other is one gesture rather than one gesture per
 * screenful.
 *
 * Row geometry is measured once, at the grab, and kept in the scroller's own
 * content coordinates: rows move under `transform` during the drag, so their
 * live rects would chase the animation, and the content offset is what keeps
 * the measurement honest while the list scrolls beneath the finger.
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
  const grab = useRef<{ y: number; rects: DOMRect[]; scroller: HTMLElement | Window } | null>(null);
  /** Latest pointer position, so the auto-scroll frame can re-aim without a move. */
  const pointerY = useRef(0);
  const frame = useRef<number | null>(null);

  /** Recompute the drag from where the finger is, in content coordinates. */
  const aim = (clientY: number) => {
    const start = grab.current;
    if (!start) return;
    const y = clientY + scrollTopOf(start.scroller);
    setDrag((d) => {
      if (!d) return d;
      const rects = start.rects;
      const dy = y - start.y;
      const centre = rects[d.from].top + rects[d.from].height / 2 + dy;
      let to = d.from;
      if (centre <= rects[0].top) to = 0;
      else if (centre >= rects[rects.length - 1].bottom) to = rects.length - 1;
      else {
        const hit = rects.findIndex((r) => centre >= r.top && centre <= r.bottom);
        if (hit !== -1) to = hit;
      }
      return { ...d, dy, to };
    });
  };

  /** While the finger sits in an edge band, scroll and keep re-aiming. */
  const tick = () => {
    frame.current = null;
    const start = grab.current;
    if (!start) return;
    const { top, bottom } = viewportOf(start.scroller);
    const y = pointerY.current;
    let speed = 0;
    if (y < top + EDGE) speed = -Math.min(MAX_SPEED, (top + EDGE - y) / 3);
    else if (y > bottom - EDGE) speed = Math.min(MAX_SPEED, (y - (bottom - EDGE)) / 3);
    if (speed !== 0) {
      const before = scrollTopOf(start.scroller);
      start.scroller.scrollBy(0, speed);
      // At either end of the list there is nothing left to scroll; stop
      // spinning frames rather than re-aiming at an unchanged position.
      if (scrollTopOf(start.scroller) !== before) aim(y);
    }
    frame.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (from: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    // Ignore secondary buttons; a right-click should not start a drag.
    if (e.button !== 0) return;
    const scroller = scrollerFor(rows.current[from]);
    const offset = scrollTopOf(scroller);
    const rects = rows.current.slice(0, items.length).map((el) => {
      const r = el?.getBoundingClientRect();
      return r && new DOMRect(r.x, r.y + offset, r.width, r.height);
    });
    if (rects.some((r) => !r)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { y: e.clientY + offset, rects: rects as DOMRect[], scroller };
    pointerY.current = e.clientY;
    setDrag({ from, to: from, dy: 0, height: (rects[from] as DOMRect).height });
    frame.current = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || !grab.current) return;
    pointerY.current = e.clientY;
    aim(e.clientY);
  };

  const end = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
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
