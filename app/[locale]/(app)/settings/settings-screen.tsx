'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import Image from 'next/image';
import { useMarket } from '@/components/app-shell/market-context';
import { getMarket, marketIds } from '@/src/markets/registry';
import { InstallSettingsRow } from '@/components/install-prompt';
import { Dropdown } from '@/components/dropdown';
import { routing } from '@/src/i18n/routing';
import { authClient, signOut, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const ta = useTranslations('auth');
  const tm = useTranslations('market');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const { setMarketId } = useMarket();

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

  const [defaultMarket, setDefaultMarket] = useState<string | null>(null);
  const user = session?.user as { name: string; email: string; defaultMarket?: string } | undefined;

  const pickMarket = async (market: string) => {
    setDefaultMarket(market);
    // Switch the live lens too: saving a preference that only applies to the
    // next fresh browser reads as the setting doing nothing.
    setMarketId(market);
    await authClient.updateUser({ defaultMarket: market });
  };

  const segment = (
    options: Array<{ value: string; label: React.ReactNode }>,
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
          <Dropdown
            options={routing.locales.map((l) => ({
              value: l,
              badge: <Flag locale={l} />,
              name: localeNames[l] ?? l,
            }))}
            active={locale}
            // Hard navigation — a client locale transition remounts the
            // [locale] layout and trips React's script-tag error (see
            // app-header.tsx).
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
            onPick={(l) => window.location.assign(`/${l}${pathname === '/' ? '' : pathname}`)}
          />,
        )}
        {row(
          t('defaultMarket'),
          <Dropdown
            options={marketIds.map((id) => ({
              value: id,
              badge: getMarket(id).currencySymbol,
              name: tm(`nationality.${id}`),
            }))}
            active={defaultMarket ?? user?.defaultMarket ?? 'US'}
            onPick={pickMarket}
            disabled={!user}
            // The symbol alone is too thin a label — say whose market it is.
            showName
          />,
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

/** Language is chosen by flag, exactly as in the header picker. */
function Flag({ locale }: { locale: string }) {
  return (
    <Image
      src={locale === 'he' ? '/flags/il.svg' : '/flags/us.svg'}
      alt={locale === 'he' ? 'עברית' : 'English'}
      width={18}
      height={17}
    />
  );
}

const localeNames: Record<string, string> = { en: 'English', he: 'עברית' };
