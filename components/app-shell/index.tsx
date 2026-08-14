import { AppContent } from './app-content';
import { AuthGuard } from './auth-guard';
import { MarketProvider } from './market-context';
import { OnboardingGuard } from './onboarding-guard';
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
      <OnboardingGuard />
      <TopNav />
      <AppContent>{children}</AppContent>
      <BottomNav />
    </MarketProvider>
  );
}
