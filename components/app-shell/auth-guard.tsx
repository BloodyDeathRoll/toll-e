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
const PUBLIC_PATHS = ['/', '/terms', '/privacy'];

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
