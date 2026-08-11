'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A 12×12 info dot and the one sentence it hides. Pinned in pixels, not
 * `size-3`: the root font-size here is 18px, which would render that 13.5.
 *
 * Small on purpose: it sits beside a label without competing with it, and the
 * explanation stays out of the way until asked for. Tap-to-open rather than
 * hover — a phone has no hover, and this is a phone app.
 */
export function InfoDot({
  label,
  note,
  align = 'start',
  className,
}: {
  /** Accessible name, e.g. "About P/E". */
  label: string;
  note: string;
  /** Which edge the bubble hangs from — flip it for a right-aligned stat. */
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <span className={cn('relative inline-flex self-start', className)} ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // The glyph is 12px in the layout; the tap target is 28px, grown
        // outwards by a pseudo-element so it costs the row no width. Padding
        // would not do it — on a 12px border-box it eats the glyph instead.
        className="relative flex size-[12px] items-center justify-center before:absolute before:-inset-2 before:content-['']"
      >
        <InfoGlyph className="size-[12px] text-muted-foreground" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            'absolute top-full z-50 mt-1 w-56 rounded-[20px] bg-well p-4 text-sm normal-case tracking-normal text-muted-foreground shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {note}
        </span>
      )}
    </span>
  );
}

/** 12×12 info glyph — lucide's own is stroke-tuned for 24px and reads muddy this small. */
export function InfoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="6" cy="3.4" r="0.75" fill="currentColor" />
      <path d="M6 5.4v3.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}
