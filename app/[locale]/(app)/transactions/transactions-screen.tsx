'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { AllocationDonut } from '@/components/allocation-donut';
import { Dropdown } from '@/components/dropdown';
import { InfoDot } from '@/components/info-dot';
import { ShieldRows } from '@/components/shield-rows';
import { UnderlineTabs } from '@/components/underline-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getMarket } from '@/src/markets/registry';
import { fmtMoney, fmtMoneySigned } from '@/lib/format';
import type { PerformancePayload } from '@/src/server/performance';
import { OTHER_SLICE } from '@/src/allocation';
import { cn } from '@/lib/utils';
import { JournalPane } from './journal-screen';
import { PnlPane, Row } from './pnl-pane';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
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
  const tt = useTranslations('taxPage');
  const tj = useTranslations('journal');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [year, setYear] = useState<number | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>('pnl');
  /**
   * The card opens closed. What the year has realized is the one figure worth
   * a permanent place at the top of this screen; the gains behind it, the
   * shields and the tax are answers to questions you have to ask first, and
   * asking costs one tap. Not persisted — every visit starts from the summary.
   */
  const [cardOpen, setCardOpen] = useState(false);
  const nl = locale === 'he' ? 'he-IL' : 'en-US';
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
        setState((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
      }
    }
  }, [year, marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on lens/year change
    setState({ status: 'loading' });
    load();
  }, [load]);

  const data = state.status === 'data' ? state.data : null;
  const yearTotals = (data?.months ?? []).reduce(
    (a, m) => ({
      gains: a.gains + m.gains,
      losses: a.losses + m.losses,
      net: a.net + m.net,
      tax: a.tax + m.tax,
    }),
    { gains: 0, losses: 0, net: 0, tax: 0 },
  );
  const money = (v: number, ccy: string) => fmtMoney(v, ccy, nl);
  const signed = (v: number, ccy: string) => fmtMoneySigned(v, ccy, nl);
  // Flip a positive magnitude to its negative, leaving zero alone — `-0`
  // formats as "-$0.00".
  const neg = (v: number) => (v > 0 ? -v : 0);
  // The server groups by the provider's own industry names and cannot
  // translate the one label it invents.
  const slices = (data?.allocation ?? []).map((a) =>
    a.label === OTHER_SLICE ? { ...a, label: t('otherSlice') } : a,
  );

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

        {data && !cardOpen && (
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            aria-expanded={false}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-start"
          >
            <AllocationDonut slices={slices} numberLocale={nl} size={26} />
            <span className="flex-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('title')}
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}

        {data && cardOpen && (
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            {/* The chevron is the way back now — it is where the closed card
                left it, so opening and closing happen in one place instead of
                one at the top and one at the foot. */}
            <button
              type="button"
              onClick={() => setCardOpen(false)}
              aria-expanded
              className="flex items-center gap-3 text-start"
            >
              <span className="flex-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('title')}
              </span>
              <ChevronUp className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {/* Where the money is, before what it did with itself. */}
            {slices.length > 0 && <AllocationDonut slices={slices} numberLocale={nl} />}

            {/* Realized leads and unrealized answers it across the row: one is
                money that has happened, the other money that has not, and
                reading them apart is most of what this screen is for. Both
                labels sit on one line so the figures under them share a
                baseline — a wrapped label on one side drops its number below
                the other's and the pair stops reading as a pair. */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[11px] font-semibold whitespace-nowrap tracking-[0.06em] uppercase text-muted-foreground">
                  {t('realizedIn', { year: data.year })}
                </h2>
                <p
                  dir="ltr"
                  className={cn(
                    'private self-start text-[26px] font-bold tracking-tight tabular-nums',
                    yearTotals.net >= 0 ? 'text-gain' : 'text-loss',
                  )}
                >
                  {signed(yearTotals.net, data.displayCurrency)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {/* The qualifier is a dot rather than a line of small print:
                    "as of today" is worth saying once, when asked, not every
                    time the card is read. */}
                <h2 className="flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap tracking-[0.06em] uppercase text-muted-foreground">
                  {t('unrealized')}
                  <InfoDot label={t('unrealized')} note={t('unrealizedNote')} align="end" />
                </h2>
                <p
                  dir="ltr"
                  className={cn(
                    'private text-[22px] font-bold tracking-tight tabular-nums',
                    data.totals.unrealized >= 0 ? 'text-gain' : 'text-loss',
                  )}
                >
                  {signed(data.totals.unrealized, data.displayCurrency)}
                </p>
              </div>
            </div>

            {/* The two halves of the realized figure, and the only rows on the
                card that explain another one — so they carry the weight of an
                answer rather than a footnote. */}
            <div className="flex flex-col gap-1.5 tabular-nums">
              <Row label={tt('gains')} value={money(yearTotals.gains, data.displayCurrency)} strong />
              <Row
                label={tt('losses')}
                value={money(neg(yearTotals.losses), data.displayCurrency)}
                strong
              />
            </div>

            <div className="h-px bg-border" />

            {/* What is standing between the next gain and a tax bill, in the
                two forms it takes. Same pair, same code, as the Tax screen. */}
            <div className="flex flex-col gap-3">
              <ShieldRows
                pool={data.totals.pool}
                shield={data.totals.shield}
                sym={market.currencySymbol}
                numberLocale={nl}
              />
            </div>

            <div className="h-px bg-border" />

            {/* Withheld leads — it is the cash actually gone. When the shield
                or month ordering makes the year owe less, both sides show. */}
            <div className="flex flex-col gap-[7px] text-sm tabular-nums">
              <Row label={t('taxPaidCard')} value={money(yearTotals.tax, data.displayCurrency)} bold big />
              {data.totals.taxRefund > 0 && (
                <>
                  <Row label={t('shouldHavePaid')} value={money(data.totals.taxOwed, data.displayCurrency)} />
                  <Row
                    label={t('refundIn', { year: data.year + 1 })}
                    value={money(data.totals.taxRefund, data.displayCurrency)}
                  />
                </>
              )}
            </div>

            {/* The year everything above reports on. */}
            {data.years.length > 1 && (
              <div className="flex justify-end">
                <Dropdown
                  options={data.years.map((y) => ({ value: String(y), name: String(y) }))}
                  active={String(data.year)}
                  onPick={(y) => setYear(Number(y))}
                  showName
                />
              </div>
            )}
          </section>
        )}
      </div>

      <UnderlineTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label={(k) => tj(`tabs.${k}`)}
        grow
        className="mx-4 mt-4"
      />

      {tab === 'pnl' ? data && <PnlPane data={data} /> : <JournalPane />}
    </main>
  );
}
