'use client';

import { Children, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A horizontal, snapping, swipeable row — the index strip on the home screen
 * shows three cards at a time and the rest are a thumb-flick away.
 *
 * Dots appear only when there is something to swipe to, so a market with
 * exactly three indexes looks like the static row it effectively is.
 *
 * An LTR-safe scroll position: RTL scrollLeft counts down from zero, so the
 * active card is read from its absolute value.
 */
export function SwipeRow({
  children,
  itemClassName,
  className,
  label,
}: {
  children: React.ReactNode;
  /** Width of one slide, e.g. three-up: w-[calc((100%-1.25rem)/3)]. */
  itemClassName?: string;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [active, setActive] = useState(0);
  // Dots count screens, not cards: with three cards to a view, a dot per card
  // would leave the last two unreachable and the row looking stuck.
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPages(Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setActive(Math.min(pages - 1, Math.round(Math.abs(el.scrollLeft) / el.clientWidth)));
  };

  return (
    <>
      <div
        ref={ref}
        onScroll={onScroll}
        role={label ? 'region' : undefined}
        aria-label={label}
        className={cn(
          'flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-6 px-6',
          // The scrollbar is noise on a card strip; the dots say the same thing.
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
      >
        {items.map((child, i) => (
          <div key={i} className={cn('shrink-0 snap-start', itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="flex justify-center gap-1.5 pt-3" aria-hidden>
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === active ? 'bg-foreground' : 'bg-faint',
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
