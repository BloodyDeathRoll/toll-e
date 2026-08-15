import { AppContent } from './app-content';
import { AuthGuard } from './auth-guard';
import { MarketProvider } from './market-context';
import { OnboardingGuard } from './onboarding-guard';
import { SearchScopeProvider } from './search-scope';
import { TopNav } from './top-nav';
import { BottomNav } from './bottom-nav';

/**
 * Two deliberate layouts (toll-e-plan.md §7.1): mobile gets a bottom tab bar,
 * desktop gets a top navbar. Content pads for whichever is active.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketProvider>
      {/* Above the navbar and the content both: a screen registers its own
          search vocabulary from inside the content, and the two search inputs
          that answer from it live in the chrome around it. */}
      <SearchScopeProvider>
        <AuthGuard />
        <OnboardingGuard />
        <TopNav />
        <AppContent>{children}</AppContent>
        <BottomNav />
      </SearchScopeProvider>
    </MarketProvider>
  );
}
