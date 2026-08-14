'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { Dropdown } from '@/components/dropdown';
import { ErrorCard } from '@/components/error-card';
import { UnderlineTabs } from '@/components/underline-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import type { PerformancePayload } from '@/src/server/performance';
import { JournalPane } from './journal-screen';
import { PnlPane } from './pnl-pane';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  // Only a 401 is 'signed-out' — see the note in components/use-portfolio.ts.
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'data'; data: PerformancePayload };

const tabs = ['pnl', 'list'] as const;

/**
 * Transactions (§3.4) — one screen for the money and the record of it.
 *
 * Performance and the journal used to be two destinations answering the same
 * question from opposite ends: what the year came to, and what was done to
 * make it. They are one page now — a summary card that belongs to both, then
 * a tab for each — which is also what lets the card's shields sit beside the
 * gains they will offset instead of a menu away.
 *
 * Scoped to the market lens like every other screen, so ₪ never shows a dollar
 * portfolio's numbers.
 */
export function TransactionsScreen() {
  const t = useTranslations('perf');
  const tj = useTranslations('journal');
  const { marketId } = useMarket();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>('pnl');
  // Only the newest request may write state: the lens hydrates a beat after
  // mount, so the previous market's request is often still in flight.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const apply = (next: State) => {
      if (gen.current === mine) setState(next);
    };
    const params = new URLSearchParams({ market: marketId });
    if (year) params.set('year', String(year));
    try {
      const res = await fetch(`/api/performance?${params}`);
      if (res.status === 401) {
        apply({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      apply(json.empty ? { status: 'empty' } : { status: 'data', data: json });
    } catch {
      if (gen.current === mine) {
        setState((s) => (s.status === 'loading' ? { status: 'error' } : s));
      }
    }
  }, [year, marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on lens/year change
    setState({ status: 'loading' });
    load();
  }, [load]);

  const data = state.status === 'data' ? state.data : null;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <AppHeader />
      <h1 className="sr-only">{tj('title')}</h1>

      <div className="flex flex-col gap-3.5 px-4">
        {state.status === 'loading' && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-full" />
          </section>
        )}

        {state.status === 'signed-out' && (
          <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{t('signIn')}</p>
            <Link
              href="/sign-in"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              {t('signInCta')}
            </Link>
          </section>
        )}

        {state.status === 'error' && <ErrorCard onRetry={load} />}

        {state.status === 'empty' && (
          <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Link
              href="/transactions/new"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              {t('emptyCta')}
            </Link>
          </section>
        )}

      </div>

      {/* The year scopes the whole screen — both the P&L's months and the
          journal's rows — so it sits above the tabs it governs. */}
      {data && (
        <div className="flex justify-end px-4 pb-2">
          <Dropdown
            options={data.years.map((y) => ({ value: String(y), name: String(y) }))}
            active={String(year ?? data.year)}
            onPick={(y) => setYear(Number(y))}
            showName
          />
        </div>
      )}

      <UnderlineTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label={(k) => tj(`tabs.${k}`)}
        grow
        className="mx-4"
      />

      {tab === 'pnl' ? (
        data && <PnlPane data={data} />
      ) : (
        <JournalPane year={year ?? data?.year ?? null} />
      )}
    </main>
  );
}
