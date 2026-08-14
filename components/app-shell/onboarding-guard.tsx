'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useBrokerProfile } from '@/components/use-broker-profile';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * The broker question is the first thing a signed-in user sees, existing
 * accounts included: while it is unanswered ('unset' — distinct from an
 * answered "later"), every screen redirects to the flow. AuthGuard's sibling,
 * same shape: client, renders nothing, replaces.
 *
 * It must not redirect while the hook is 'loading' (or the app flashes
 * onboarding on every cold load), and it must respect useHydrated or it
 * trips the hydration mismatch that helper exists to prevent.
 */
export function OnboardingGuard() {
  const { state, reload } = useBrokerProfile();
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();

  // This instance fetched before the flow answered, so the client navigation
  // out of /onboarding still reads 'unset' here — without a re-check the
  // redirect below would bounce the user straight back into the flow they
  // just finished. The flag is a ref set before the redirect effect runs in
  // the same commit (effects run in definition order, and a state flag would
  // lose that race: every effect of a commit sees the values it rendered
  // with), and it stays up until the re-fetch lands.
  const prevPath = useRef(pathname);
  const rechecking = useRef(false);
  useEffect(() => {
    if (prevPath.current === '/onboarding' && pathname !== '/onboarding') {
      rechecking.current = true;
      void reload().finally(() => {
        rechecking.current = false;
      });
    }
    prevPath.current = pathname;
  }, [pathname, reload]);

  useEffect(() => {
    if (!hydrated || rechecking.current || state.status !== 'unset') return;
    if (pathname === '/onboarding') return;
    router.replace('/onboarding');
  }, [hydrated, state.status, pathname, router]);

  return null;
}
