import { MarketProvider } from './market-context';
import { TopNav } from './top-nav';
import { BottomNav } from './bottom-nav';

/**
 * Two deliberate layouts (toll-e-plan.md §7.1): mobile gets a bottom tab bar,
 * desktop gets a top navbar. Content pads for whichever is active.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      <TopNav />
      <div className="flex-1 pb-16 md:pb-0">{children}</div>
      <BottomNav />
    </MarketProvider>
  );
}
