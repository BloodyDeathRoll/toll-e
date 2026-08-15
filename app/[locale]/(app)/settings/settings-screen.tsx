'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { getMarket, marketIds } from '@/src/markets/registry';
import { InstallSettingsRow } from '@/components/install-prompt';
import { Dropdown } from '@/components/dropdown';
import { LocalePicker } from '@/components/locale-picker';
import { MonitorCog, Moon, Sun } from 'lucide-react';
import { authClient, signOut, useSession } from '@/lib/auth-client';
import { useBrokerProfile } from '@/components/use-broker-profile';
import { brokers } from '@/src/brokers/registry';
import { setTheme, themeChoice, type ThemeChoice } from '@/lib/theme';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsScreen() {
  const t = useTranslations('settings');
  const ta = useTranslations('auth');
  const tm = useTranslations('market');
  const locale = useLocale();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { setMarketId } = useMarket();

  // The stored *choice*, not the html class: 'system' and 'dark' can both be
  // showing the dark palette, and the segment has to say which one is on.
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  // `useSession` answers from its client-side cache on the very first client
  // render, while the server never has a session at all — so anything derived
  // from it has to wait for mount or the two renders disagree and React throws
  // the hydrated tree away. Same reason the theme choice is read here rather
  // than inline.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read stored state after mount
    setThemeState(themeChoice());
    setMounted(true);
  }, []);
  const pickTheme = (value: string) => {
    const choice = value as ThemeChoice;
    setTheme(choice);
    setThemeState(choice);
  };

  const [defaultMarket, setDefaultMarket] = useState<string | null>(null);
  // Held back until mount, so every reader below — the disabled state, the
  // active market, the Account section — renders the signed-out picture the
  // server rendered and only then swaps.
  const user = mounted
    ? (session?.user as { name: string; email: string; defaultMarket?: string } | undefined)
    : undefined;

  // The broker choice follows the defaultMarket precedent: a preference
  // surfaced in two places writes the same state from both, so this row
  // links to the onboarding flow itself — the flow *is* the editor.
  const { state: brokerState } = useBrokerProfile();
  const currentBroker =
    brokerState.status === 'data' && brokerState.profile.brokerId
      ? brokers[brokerState.profile.brokerId]
      : null;

  const pickMarket = async (market: string) => {
    setDefaultMarket(market);
    // Switch the live lens too: saving a preference that only applies to the
    // next fresh browser reads as the setting doing nothing.
    setMarketId(market);
    await authClient.updateUser({ defaultMarket: market });
  };

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
          <Dropdown
            options={[
              { value: 'system', badge: <MonitorCog className="size-4" aria-hidden />, name: t('system') },
              { value: 'dark', badge: <Moon className="size-4" aria-hidden />, name: t('dark') },
              { value: 'light', badge: <Sun className="size-4" aria-hidden />, name: t('light') },
            ]}
            active={theme}
            onPick={pickTheme}
            // An icon alone would leave System unsayable, and a moon on the
            // trigger reads as the palette rather than the choice.
            showName
          />,
        )}
        {row(t('language'), <LocalePicker />)}
        {row(
          t('defaultMarket'),
          <Dropdown
            options={marketIds.map((id) => ({
              value: id,
              badge: (
                <Image src={getMarket(id).flag} alt="" width={16} height={15} aria-hidden />
              ),
              name: tm(`nationality.${id}`),
            }))}
            active={defaultMarket ?? user?.defaultMarket ?? 'US'}
            onPick={pickMarket}
            disabled={!user}
            // Flag plus nationality, the same pairing as the header picker —
            // whose market, not which currency.
            showName
          />,
        )}
        {row(
          t('broker'),
          <Link
            href="/onboarding"
            aria-disabled={!user}
            className={cn(
              'flex h-[48px] items-center gap-1.5 rounded-lg border border-border bg-card-lighter px-4 text-sm text-foreground hover:bg-card-hover',
              !user && 'pointer-events-none opacity-50',
            )}
          >
            {currentBroker
              ? locale === 'he'
                ? currentBroker.nameHe
                : currentBroker.name
              : t('brokerNotSet')}
            <ChevronRight className="size-4 text-muted-foreground rtl:-scale-x-100" aria-hidden />
          </Link>,
        )}
        {mounted && !user && !isPending && (
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
          /* Who you are and the way out, across from each other — the same
             label-and-control row every setting above is built from. */
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push('/');
                router.refresh();
              }}
              className="flex h-[48px] shrink-0 items-center rounded-lg border border-border bg-card-lighter px-4 text-[15px] text-loss hover:bg-card-hover"
            >
              {ta('signOut')}
            </button>
          </div>
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

