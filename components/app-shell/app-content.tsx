'use client';

import { usePathname } from '@/src/i18n/navigation';
import { reservesBottomNav } from './bottom-nav';
import { cn } from '@/lib/utils';

/**
 * The content column. Every screen ends in a bar fixed to the bottom edge —
 * the tab bar on the app's four screens, an ActionBar on the full-page flows
 * — so the column always reserves room for one; only how much differs. The
 * action bar is the taller of the two: a 56px button, its label, and the line
 * naming what is about to be saved — 145px measured with all three, against
 * the tab bar's 104.
 *
 * Keyed off the path alone, never the session, so the server and the first
 * client paint agree and the page does not jump under you.
 */
export function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      className={cn(
        'flex flex-1 flex-col md:pb-0',
        reservesBottomNav(pathname) ? 'pb-[104px]' : 'pb-[152px]',
      )}
    >
      {children}
    </div>
  );
}
