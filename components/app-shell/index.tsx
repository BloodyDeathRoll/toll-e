import { AuthGuard } from './auth-guard';
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
      <AuthGuard />
      <TopNav />
      <div className="flex flex-1 flex-col pb-[104px] md:pb-0">{children}</div>
      <BottomNav />
    </MarketProvider>
  );
}
