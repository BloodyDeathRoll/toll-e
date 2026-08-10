'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signIn } from '@/lib/auth-client';

/** Design btnPr: black pill (inverts in dark), Google mark, 14px medium. */
export function GoogleButton() {
  const t = useTranslations('auth');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(null);
    const res = await signIn.social({ provider: 'google', callbackURL: '/' });
    // A successful call redirects to Google, so reaching here means it failed.
    if (res?.error) {
      setError(res.error.message ?? t('error'));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium leading-6 text-background hover:opacity-90 disabled:opacity-60"
      >
        <GoogleMark />
        {t('continueWithGoogle')}
      </button>
      {error && <p className="text-[13px] text-loss">{error}</p>}
    </div>
  );
}

/** Google's brand mark — fixed colors on purpose, per their brand guidelines. */
export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
