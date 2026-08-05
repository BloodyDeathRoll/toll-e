'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/src/i18n/navigation';
import { signIn, signUp } from '@/lib/auth-client';

export function AuthForm({ mode }: { mode: 'signIn' | 'signUp' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === 'signIn'
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? t('error'));
      return;
    }
    router.push('/');
    router.refresh();
  };

  const field =
    'rounded-lg border border-border bg-well px-3.5 py-3 text-base text-foreground outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20';

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6"
      >
        <div className="flex flex-col gap-1 pb-1">
          <span className="text-[22px] font-bold tracking-tight text-foreground">toll-e</span>
          <h1 className="text-sm text-muted-foreground">
            {mode === 'signIn' ? t('signIn') : t('signUp')}
          </h1>
        </div>
        {mode === 'signUp' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-subtle">{t('name')}</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-subtle">{t('email')}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-subtle">{t('password')}</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>
        {error && <p className="text-[13px] text-loss">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-12 rounded-lg bg-primary text-base font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {mode === 'signIn' ? t('signIn') : t('signUp')}
        </button>
        <p className="text-center text-[13px] text-muted-foreground">
          {mode === 'signIn' ? t('noAccount') : t('haveAccount')}{' '}
          <Link href={mode === 'signIn' ? '/sign-up' : '/sign-in'} className="font-semibold text-brand">
            {mode === 'signIn' ? t('signUp') : t('signIn')}
          </Link>
        </p>
      </form>
    </main>
  );
}
