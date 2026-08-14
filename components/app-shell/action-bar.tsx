'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The bottom bar for a full-page flow — the tab bar's counterpart on the
 * screens that replace it (see `OWN_ACTION` in bottom-nav.tsx), and built to
 * the same spec: same surface, same safe-area padding, and the round primary
 * button breaking the bar's top edge by 12px exactly as the tab bar's plus
 * does. One shape means one thing wherever it sits at the bottom of a screen.
 *
 * It is chrome, not content: fixed to the phone's own bottom edge, above
 * whatever is scrolling behind it, and always on screen. A flow exists to
 * reach one action, so that action should never be something you scroll to
 * find — and while the form is incomplete it stays put and greys out, which
 * answers "not yet" where an absent button would only have said "nowhere".
 *
 * Inside the desktop device frame this anchors to the card rather than the
 * window, for the same reason the tab bar does: `.app-device` carries a
 * transform, which makes it the containing block for `fixed`.
 */
export function ActionBar({
  label,
  disabled,
  onClick,
}: {
  /** The action, named under the button. */
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="app-frame fixed inset-x-0 bottom-0 z-40 bg-card-darker">
      {/* Clears the half of the button that hangs into the bar: 56px of
          button, 12px of it above the edge. */}
      <div className="flex flex-col items-center px-6 pt-[52px] pb-[max(24px,env(safe-area-inset-bottom))]">
        <span className={cn('text-xs text-foreground', disabled && 'opacity-50')}>{label}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="absolute -top-3 start-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 rtl:translate-x-1/2"
      >
        <Check className="size-6" aria-hidden />
      </button>
    </div>
  );
}
