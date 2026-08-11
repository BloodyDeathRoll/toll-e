'use client';

import { usePathname } from '@/src/i18n/navigation';
import { reservesBottomNav } from './bottom-nav';
import { cn } from '@/lib/utils';

/**
 * The content column. It reserves the tab bar's height so a fixed bar never
 * sits on the last row — but only where the bar actually shows: a full-page
 * flow that hides it would otherwise end in 104px of nothing.
 *
 * Keyed off the path alone, never the session, so the server and the first
 * client paint agree and the page does not jump under you.
 */
export function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={cn('flex flex-1 flex-col md:pb-0', reservesBottomNav(pathname) && 'pb-[104px]')}>
      {children}
    </div>
  );
}
