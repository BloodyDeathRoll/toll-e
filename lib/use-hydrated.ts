'use client';

import { useSyncExternalStore } from 'react';

const noSubscribe = () => () => {};

/**
 * False on the server and through hydration, true from the render after.
 *
 * better-auth resolves `useSession` from a client-side cache synchronously,
 * so the browser knows you are signed in a render *before* the server-sent
 * HTML does. Anything that renders on `session` alone therefore appears in
 * the first client paint but not in the HTML, and React throws the whole tree
 * away as a hydration mismatch. Gating on this makes that first paint match
 * the HTML; the session lands on the next one.
 *
 * `useSyncExternalStore`'s server snapshot is what React uses while
 * hydrating, which is the whole trick — no effect, no cascading render.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
