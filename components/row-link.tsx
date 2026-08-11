'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * A ticker row that navigates to the stock view. Opening it is a server
 * render away, so the row answers the tap immediately: it dims and a spinner
 * turns over it for as long as the navigation is pending.
 *
 * The indicator is an overlay, never a column. A spinner sitting in the row's
 * flow — even an always-present, zero-opacity one — steals width from the end
 * of the row, and the numbers stop meeting the margin the name is measured
 * against (mirrored, and just as wrong, in RTL).
 *
 * A prefetched route never goes pending, which is the point: it was instant.
 */
export function RowLink({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={cn('relative', className)} {...rest}>
      {children}
      <RowPending />
    </Link>
  );
}

function RowPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 transition-opacity duration-150',
        pending ? 'opacity-100' : 'opacity-0',
      )}
    >
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </span>
  );
}
