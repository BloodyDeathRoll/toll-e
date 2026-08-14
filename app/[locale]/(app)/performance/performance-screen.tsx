'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { AllocationDonut } from '@/components/allocation-donut';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { Dropdown } from '@/components/dropdown';
import { ErrorCard } from '@/components/error-card';
import { InfoDot } from '@/components/info-dot';
import { ShieldRows } from '@/components/shield-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { getMarket } from '@/src/markets/registry';
import { fmtDate, fmtMoney, fmtMoneySigned, fmtNum } from '@/lib/format';
import { OTHER_SLICE } from '@/src/allocation';
import type { PerformancePayload } from '@/src/server/performance';
import { cn } from '@/lib/utils';
import { Row } from '../transactions/pnl-pane';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  // Only a 401 is 'signed-out' — see the note in components/use-portfolio.ts.
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'data'; data: PerformancePayload };

/**
 * Performance (§3.4) — two cards and nothing else: where the money is, and
 * what it has done.
 *
 * They were one card on the Activity screen, stacked above the tabs, which
 * made every visit to the transaction list begin by scrolling past a page of
 * figures. Separating them gives each its own subject, and gives Activity
 * back to the list it is named for.
 *
 * Scoped to the market lens like every other screen, so ₪ never shows a
 * dollar portfolio's numbers.
 */
export function PerformanceScreen() {
  const t = useTranslations('perf');
  const tt = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [year, setYear] = useState<number | null>(null);
  const nl = locale === 'he' ? 'he-IL' : 'en-US';
  const thisYear = new Date().getFullYear();
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
  // The server groups by the provider's own sector names and cannot translate
  // the one label it invents.
  const slices = (data?.allocation ?? []).map((a) =>
    a.label === OTHER_SLICE ? { ...a, label: t('otherSlice') } : a,
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <AppHeader />
      <h1 className="sr-only">{t('title')}</h1>

      <div className="flex flex-col gap-3.5 px-4 pt-2">
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

        {/* The year everything below reports on. Above both cards rather than
            buried under the second one: it governs the page, so it reads as
            the page's own control. */}
        {data && (
          <div className="flex justify-end">
            <Dropdown
              options={data.years.map((y) => ({ value: String(y), name: String(y) }))}
              active={String(data.year)}
              onPick={(y) => setYear(Number(y))}
              showName
            />
          </div>
        )}

        {data && data.year === thisYear && slices.length > 0 && (
          /* Where the money is — the holdings as they stand, which is the only
             sense a breakdown of a portfolio has. It therefore has no reading
             for a past year, so it shows only while the current one is
             picked rather than sitting under an older year's figures. */
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('sectors')}
            </h2>
            <AllocationDonut slices={slices} numberLocale={nl} />
          </section>
        )}

        {data && data.costs.totalConverted > 0 && (
          /* What the year cost in fees — the tax engine's quieter sibling.
             Commission rows stay native per currency and are never summed
             across; only the total converts, at the payload's rate. */
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('costsTitle')}
            </h2>
            <div className="flex flex-col gap-1.5 text-sm tabular-nums">
              {Object.entries(data.costs.tradeCommissions).map(([ccy, amount]) => (
                <div key={ccy} className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {Object.keys(data.costs.tradeCommissions).length > 1
                      ? `${t('tradeCommissions')} (${ccy})`
                      : t('tradeCommissions')}
                    <InfoDot label={t('tradeCommissions')} note={t('commissionsInPnlNote')} />
                  </span>
                  <span dir="ltr" className="private text-foreground">
                    {money(amount, ccy)}
                  </span>
                </div>
              ))}
              {data.costs.accountFee && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {t('accountFees')}
                    <InfoDot label={t('accountFees')} note={t('accountLevelNote')} />
                  </span>
                  <span dir="ltr" className="private text-foreground">
                    {money(data.costs.accountFee.amount, data.costs.accountFee.currency)}
                  </span>
                </div>
              )}
              {data.costs.custody && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {t('custodyEstimated')}
                    <InfoDot
                      label={t('custodyEstimated')}
                      note={
                        data.costs.custody.quartersAtCost > 0
                          ? `${t('custodyEstNote')} ${t('quartersAtCost', {
                              atCost: data.costs.custody.quartersAtCost,
                              quarters: data.costs.custody.quarters,
                            })}`
                          : t('custodyEstNote')
                      }
                    />
                  </span>
                  <span dir="ltr" className="private text-foreground">
                    {money(data.costs.custody.amount, data.costs.custody.currency)}
                  </span>
                </div>
              )}
              <div className="h-px bg-border" />
              <Row label={t('costsTotal')} value={money(data.costs.totalConverted, data.displayCurrency)} bold big />
            </div>
            {/* Only worth saying when a figure was actually converted. */}
            {(Object.keys(data.costs.tradeCommissions).some((c) => c !== data.displayCurrency) ||
              (data.costs.accountFee && data.costs.accountFee.currency !== data.displayCurrency) ||
              (data.costs.custody && data.costs.custody.currency !== data.displayCurrency)) && (
              <p className="text-xs text-muted-foreground">
                {t('fxNote', { rate: fmtNum(data.fx.rate, nl, 3), date: fmtDate(data.fx.asOf, locale) })}
              </p>
            )}
          </section>
        )}

        {data && (
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            {/* Realized above unrealized rather than beside it: one is money
                that has happened and the other money that has not, and stacked
                they read as two answers instead of a comparison. */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[11px] font-semibold whitespace-nowrap tracking-[0.06em] uppercase text-muted-foreground">
                  {t('realized')}
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
              <div className="flex flex-col gap-0.5">
                {/* The qualifier is a dot rather than a line of small print:
                    "as of today" is worth saying once, when asked. */}
                <h2 className="flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap tracking-[0.06em] uppercase text-muted-foreground">
                  {t('unrealized')}
                  <InfoDot label={t('unrealized')} note={t('unrealizedNote')} />
                </h2>
                <p
                  dir="ltr"
                  className={cn(
                    'private self-start text-[22px] font-bold tracking-tight tabular-nums',
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
              <Row
                label={tt('realizedGains')}
                value={money(yearTotals.gains, data.displayCurrency)}
                strong
              />
              <Row
                label={tt('realizedLosses')}
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

          </section>
        )}
      </div>
    </main>
  );
}
