'use client';

import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * A ticker row that navigates to the stock view. Opening it is a server
 * render away, so the row answers the tap immediately: a spinner at its
 * trailing edge for as long as the navigation is pending.
 *
 * The spinner is always in the layout and only fades in — an indicator that
 * appears out of nowhere would shove the row's numbers sideways mid-tap.
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
    <Link href={href} className={className} {...rest}>
      {children}
      <RowSpinner />
    </Link>
  );
}

function RowSpinner() {
  const { pending } = useLinkStatus();
  return (
    <Loader2
      aria-hidden
      className={cn(
        'size-4 shrink-0 animate-spin text-muted-foreground transition-opacity duration-150',
        pending ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}
