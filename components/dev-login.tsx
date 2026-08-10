'use client';

import { useEffect, useState } from 'react';
import { signIn, signUp } from '@/lib/auth-client';

/**
 * Dev-only password login for on-device (LAN) review, where Google OAuth is
 * impossible: Google refuses private-IP redirect URIs. Kept off the sign-in
 * screen — append ?dev=1 to show it. Needs NEXT_PUBLIC_DEV_LOGIN=1; the
 * server side is the same E2E_TEST_AUTH email auth that is hard-disabled in
 * production (lib/auth.ts).
 */
export function DevLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL-derived init
    setAsked(new URLSearchParams(window.location.search).has('dev'));
  }, []);

  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== '1' || !asked) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    const res = await signIn.email({ email, password });
    if (!res?.error) {
      window.location.reload();
      return;
    }
    // No such account yet — create it (dev database only).
    const created = await signUp.email({
      email,
      password,
      name: email.split('@')[0] || 'dev',
    });
    if (created?.error) {
      setError(created.error.message ?? 'failed');
      setBusy(false);
      return;
    }
    window.location.reload();
  };

  return (
    <div className="mt-6 flex w-full max-w-xs flex-col gap-2 border-t border-border pt-4">
      <p className="text-center text-[11px] uppercase tracking-wide text-faint">dev login</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        className="rounded-lg border border-border bg-well px-3.5 py-2.5 text-sm text-foreground outline-none"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        className="rounded-lg border border-border bg-well px-3.5 py-2.5 text-sm text-foreground outline-none"
      />
      <button
        type="button"
        disabled={busy || !email || password.length < 8}
        onClick={go}
        className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
      >
        Sign in / sign up
      </button>
      {error && <p className="text-center text-[13px] text-loss">{error}</p>}
    </div>
  );
}
