'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useSession } from '@/lib/auth-client';

/**
 * Signed out, the app is a sign-in wall: every screen bounces to '/', which
 * renders the sign-in card. The legal documents stay public — people need to
 * read the terms before agreeing to them — and the auth routes are outside
 * this layout entirely.
 */
// '/onboarding' is listed because the match is an exact `includes`: a user
// whose session expires mid-flow should land on the sign-in wall via the
// API's 401, not get bounced by a path check while the form is on screen.
const PUBLIC_PATHS = ['/', '/terms', '/privacy', '/onboarding'];

export function AuthGuard() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isPending || session) return;
    if (PUBLIC_PATHS.includes(pathname)) return;
    router.replace('/');
  }, [isPending, session, pathname, router]);

  return null;
}
