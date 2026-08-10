'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { InstallSettingsRow } from '@/components/install-prompt';
import { usePrivacy } from '@/components/use-privacy';
import { authClient, signOut, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const ta = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const { on: privacyOn, toggle: togglePrivacy } = usePrivacy();

  // Theme state mirrors the html class (set pre-paint by the layout script).
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read DOM state after mount
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);
  const pickTheme = (value: string) => {
    const dark = value === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('toll-e.theme', value);
    setTheme(dark ? 'dark' : 'light');
  };

  const [displayCurrency, setDisplayCurrency] = useState<string | null>(null);
  const [defaultMarket, setDefaultMarket] = useState<string | null>(null);
  const user = session?.user as
    | { name: string; email: string; displayCurrency?: string; defaultMarket?: string }
    | undefined;

  const pickCurrency = async (ccy: string) => {
    setDisplayCurrency(ccy);
    await authClient.updateUser({ displayCurrency: ccy });
  };
  const pickMarket = async (market: string) => {
    setDefaultMarket(market);
    await authClient.updateUser({ defaultMarket: market });
  };

  const segment = (
    options: Array<{ value: string; label: string }>,
    active: string,
    onPick: (v: string) => void,
    disabled = false,
  ) => (
    <div className={cn('flex gap-0.5 rounded-lg border border-border bg-background p-[3px]', disabled && 'opacity-50')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[13px]',
            o.value === active
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const row = (label: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-foreground">{label}</span>
      {control}
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      {/* Account is a tab destination, so it carries the app header rather
          than a back arrow (which had nowhere meaningful to go). */}
      <AppHeader />
      <div className="flex flex-col gap-3.5 px-4 pb-4 md:py-7">
        <h1 className="hidden text-[22px] font-bold tracking-tight text-foreground md:block">
          {t('title')}
        </h1>

      {/* Appearance & locale — work signed out too */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('appearance')}
        </h2>
        {row(
          t('theme'),
          segment(
            [
              { value: 'dark', label: t('dark') },
              { value: 'light', label: t('light') },
            ],
            theme,
            pickTheme,
          ),
        )}
        {row(
          t('language'),
          segment(
            [
              { value: 'en', label: 'English' },
              { value: 'he', label: 'עברית' },
            ],
            locale,
            // Hard navigation — a client locale transition remounts the
            // [locale] layout and trips React's script-tag error (see
            // app-header.tsx).
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
            (l) => window.location.assign(`/${l}${pathname === '/' ? '' : pathname}`),
          ),
        )}
        {row(
          t('hideAmounts'),
          segment(
            [
              { value: 'off', label: t('off') },
              { value: 'on', label: t('on') },
            ],
            privacyOn ? 'on' : 'off',
            (v) => {
              if ((v === 'on') !== privacyOn) togglePrivacy();
            },
          ),
        )}
      </section>

      {/* Preferences — persisted on the account */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('preferences')}
        </h2>
        {row(
          t('displayCurrency'),
          segment(
            [
              { value: 'USD', label: '$ USD' },
              { value: 'ILS', label: '₪ ILS' },
            ],
            displayCurrency ?? user?.displayCurrency ?? 'USD',
            pickCurrency,
            !user,
          ),
        )}
        {row(
          t('defaultMarket'),
          segment(
            [
              { value: 'US', label: '$ US' },
              { value: 'IL', label: '₪ IL' },
            ],
            defaultMarket ?? user?.defaultMarket ?? 'US',
            pickMarket,
            !user,
          ),
        )}
        {!user && !isPending && (
          <p className="text-xs text-muted-foreground">{t('signInForPrefs')}</p>
        )}
      </section>

      <InstallSettingsRow />

      {/* Account */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('account')}
        </h2>
        {user ? (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push('/');
                router.refresh();
              }}
              className="self-start rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-semibold text-loss hover:bg-accent"
            >
              {ta('signOut')}
            </button>
          </>
        ) : (
          <Link
            href="/sign-in"
            className="self-start rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {ta('signIn')}
          </Link>
        )}
      </section>
      </div>
    </main>
  );
}
