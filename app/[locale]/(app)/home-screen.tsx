'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Search, Settings } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MarketMenu } from '@/components/app-shell/market-menu';
import { MoreLink } from '@/components/more-link';
import { HoldingsTable, positionRows } from '@/components/holdings-table';
import { PerformanceChart, type OverlayRow } from '@/components/performance-chart';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { ReserveBar } from '@/components/reserve-bar';
import { StaleBadge } from '@/components/stale-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistCard } from '@/components/watchlist-card';
import type { ChartRange } from '@/src/market-data/types';
import { useIndexQuotes } from '@/components/use-market-data';
import { usePortfolioPositions } from '@/components/use-portfolio';
import { useTax } from '@/components/use-tax';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtDate, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const ranges = ['1D', '1M', '6M', 'YTD', '1Y', 'All'] as const;
const rangeMap: Record<(typeof ranges)[number], ChartRange> = {
  '1D': '1d',
  '1M': '1mo',
  '6M': '6mo',
  YTD: 'ytd',
  '1Y': '1y',
  All: 'max',
};

export function HomeScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const currencyLabel = locale === 'he' ? 'ש״ח' : market.currency;
  const [range, setRange] = useState<(typeof ranges)[number]>('1D');
  // Stocks toggled OFF the performance chart (default: all overlaid).
  const [hiddenOverlays, setHiddenOverlays] = useState<Set<string>>(new Set());
  const toggleOverlay = (symbol: string) =>
    setHiddenOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  const [showPortfolioLine, setShowPortfolioLine] = useState(true);
  const { quotes: indexQuotes, stale: indexesStale } = useIndexQuotes(marketId);
  const { state } = usePortfolioPositions(marketId);
  const { state: taxState } = useTax(marketId);
  // Signed-in states: 'empty' gets a first-transaction CTA instead of the
  // (signed-out) demo showcase; 'loading' gets skeletons, never fake numbers.
  const loading = state.status === 'loading';
  const empty = state.status === 'empty';
  const name = (x: { name: string; nameHe?: string }) =>
    locale === 'he' && x.nameHe ? x.nameHe : x.name;

  // Real portfolio once transactions exist; demo showcase otherwise.
  const real = state.status === 'data' ? state.data : null;
  const taxRate = real?.portfolio.taxRatePct ?? data.tax.ratePct;
  // Live ledger for the latest year with sales; demo otherwise (Phase 3).
  const realLedger =
    taxState.status === 'data'
      ? taxState.data.years.reduce((a, b) => (b.year > a.year ? b : a))
      : null;
  const reserve = realLedger
    ? {
        year: realLedger.year,
        due: realLedger.due,
        net: realLedger.net,
        carried: realLedger.shieldUsed,
        taxable: realLedger.taxable,
        isReal: true,
      }
    : {
        year: data.tax.year,
        due: data.tax.due,
        net: data.tax.realizedGains - data.tax.realizedLosses,
        carried: data.tax.carriedLoss,
        taxable: data.tax.taxable,
        isReal: false,
      };
  const rows = real ? positionRows(real.positions, taxRate) : null;
  const overlayRows: OverlayRow[] = (rows ?? data.holdings).map((h) => ({
    symbol: h.symbol,
    shares: h.shares,
  }));
  const p = real
    ? {
        value: real.totals.marketValue,
        dayChange: real.totals.dayGain,
        dayChangePct: real.totals.dayGainPct,
        allTimeChange: real.totals.totalGain,
        allTimePct: real.totals.totalGainPct,
      }
    : data.portfolio;
  const up = p.dayChange >= 0;

  const emptyCard = (
    <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold text-foreground">{t('home.emptyTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('home.emptyBody')}</p>
      <Link
        href="/transactions/new"
        className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
      >
        {t('home.emptyCta')}
      </Link>
    </section>
  );

  const valueSkeleton = (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:px-6 md:py-[22px]">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-4 w-64" />
    </section>
  );

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile ---------- */}
      <div className="flex flex-col gap-3.5 p-4 md:hidden">
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px] font-bold tracking-tight text-foreground">
              {t('app.name')}
            </span>
            <Link
              href="/transactions/new"
              aria-label={t('nav.addTransaction')}
              className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Plus className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <PrivacyToggle />
            <Link href="/settings" aria-label={t('nav.settings')} className="text-muted-foreground">
              <Settings className="size-[18px]" aria-hidden />
            </Link>
            <MarketMenu />
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('nav.search')}
            className="h-12 w-full rounded-lg border border-border bg-card ps-10 pe-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
            disabled
          />
        </div>

        {/* Portfolio value */}
        {loading && valueSkeleton}
        {empty && emptyCard}
        {!loading && !empty && (
          <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('home.portfolioValue')}
              </h2>
              <span className="text-xs text-faint">
                {t('home.holdingsIn', { currency: currencyLabel })}
              </span>
            </div>
            <p dir="ltr" className="private self-start text-[34px] font-semibold tracking-tight text-foreground tabular-nums">
              {sym}
              {fmtNum(p.value, nl)}
            </p>
            <p className="private flex gap-3.5 text-sm font-medium tabular-nums">
              <span className={up ? 'text-gain' : 'text-loss'}>
                <span dir="ltr">{fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})</span>{' '}
                {t('home.today')}
              </span>
              <span className={p.allTimePct >= 0 ? 'text-gain' : 'text-loss'}>
                <span dir="ltr">{fmtPct(p.allTimePct, nl)}</span> {t('home.allWord')}
              </span>
            </p>
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-muted-foreground">{t('home.taxReserve')}</span>
                <span dir="ltr" className="private self-start text-xl font-semibold text-foreground tabular-nums">
                  {sym}
                  {fmtNum(reserve.due, nl)}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <MoreLink href="/tax">{t('home.taxView')}</MoreLink>
                <MoreLink href="/performance">{t('nav.performance')}</MoreLink>
              </div>
            </div>
          </section>
        )}

        {/* Index trio */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t(`home.indexesTitle.${marketId}`)}
              </h2>
              <StaleBadge show={indexesStale} />
            </span>
            <MoreLink href="/markets">{t('nav.markets')}</MoreLink>
          </div>
          <div className="flex gap-2.5">
            {data.indexes.slice(0, 3).map((ix) => {
              const live = indexQuotes[ix.symbol];
              const value = live?.price ?? ix.value;
              const pct = live?.changePct ?? ix.changePct;
              return (
                <div key={ix.symbol} className="flex flex-1 flex-col gap-[3px] rounded-2xl border border-border bg-card p-3">
                  <span className="text-[13px] font-semibold text-foreground">{name(ix)}</span>
                  <span dir="ltr" className="self-start text-[15px] text-foreground tabular-nums">
                    {fmtNum(value, nl)}
                  </span>
                  <span
                    dir="ltr"
                    className={cn('self-start text-xs tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}
                  >
                    {fmtPct(pct, nl)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Holdings */}
        {loading && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </section>
        )}
        {!loading && !empty && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.holdings')}
            </h2>
            <span className="text-xs text-faint">{t('home.marketValue')}</span>
          </div>
          {rows
            ? rows.map((h) => (
                <Link
                  key={h.symbol}
                  href={`/stock/${h.symbol}`}
                  className="flex items-center justify-between border-t border-border px-4 py-[11px] hover:bg-accent"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-foreground">{h.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('home.sharesAvg', { shares: fmtNum(h.shares, nl, 0), avg: fmtNum(h.avgCost, nl) })}
                    </span>
                  </span>
                  <span className="private flex flex-col items-end gap-0.5 tabular-nums">
                    <span dir="ltr" className="text-[15px] text-foreground">{fmtNum(h.marketValue, nl)}</span>
                    <span dir="ltr" className={cn('text-xs', h.totalGainPct >= 0 ? 'text-gain' : 'text-loss')}>
                      {fmtPct(h.totalGainPct, nl)}
                    </span>
                  </span>
                </Link>
              ))
            : data.holdings.map((h) => (
                <Link
                  key={h.symbol}
                  href={`/stock/${h.symbol}`}
                  className="flex items-center justify-between border-t border-border px-4 py-[11px] hover:bg-accent"
                >
                  <span className="flex flex-col gap-0.5">
                    {/* Design: ticker in English, company name in Hebrew. */}
                    <span className="text-[15px] font-semibold text-foreground">
                      {locale === 'he' && h.nameHe ? h.nameHe : h.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('home.sharesAvg', { shares: fmtNum(h.shares, nl, 0), avg: fmtNum(h.avgCost, nl) })}
                    </span>
                  </span>
                  <span className="private flex flex-col items-end gap-0.5 tabular-nums">
                    <span dir="ltr" className="text-[15px] text-foreground">{fmtNum(h.marketValue, nl)}</span>
                    <span dir="ltr" className={cn('text-xs', h.dayChangePct >= 0 ? 'text-gain' : 'text-loss')}>
                      {fmtPct(h.dayChangePct, nl)} · {fmtPct(h.totalGainPct, nl)}
                    </span>
                  </span>
                </Link>
              ))}
          <div className="flex justify-end border-t border-border bg-well px-4 py-[11px]">
            <MoreLink href="/transactions">{t('home.allTransactions')}</MoreLink>
          </div>
        </section>
        )}
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden flex-1 gap-5 p-7 md:flex">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* Portfolio chart card */}
          {loading && valueSkeleton}
          {empty && emptyCard}
          {!loading && !empty && (
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-6 py-[22px]">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('home.holdingsCurrency', { currency: currencyLabel })}
                </h2>
                <p dir="ltr" className="private self-start text-[38px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(p.value, nl)}
                </p>
                <p className="private flex gap-4 text-sm tabular-nums">
                  <span className={up ? 'text-gain' : 'text-loss'}>
                    <span dir="ltr">{fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})</span>{' '}
                    {t('home.today')}
                  </span>
                  <span className={p.allTimeChange >= 0 ? 'text-gain' : 'text-loss'}>
                    <span dir="ltr">{fmtSigned(p.allTimeChange, nl)} ({fmtPct(p.allTimePct, nl)})</span>{' '}
                    {t('home.allTimeWord')}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <div dir="ltr" className="flex gap-0.5 rounded-lg border border-border bg-background p-[3px]">
                  {ranges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs',
                        r === range
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <Link
                  href="/transactions/new"
                  aria-label={t('nav.addTransaction')}
                  className="flex size-[30px] items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                >
                  <Plus className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
            <PerformanceChart
              rows={overlayRows}
              hidden={hiddenOverlays}
              range={rangeMap[range]}
              height={150}
              showPortfolio={showPortfolioLine}
            />
          </section>
          )}

          {!loading && !empty && (
            <HoldingsTable
              marketId={marketId}
              rows={rows ?? undefined}
              taxRatePct={taxRate}
              overlay={{
                hidden: hiddenOverlays,
                onToggle: toggleOverlay,
                portfolioVisible: showPortfolioLine,
                onTogglePortfolio: () => setShowPortfolioLine((v) => !v),
              }}
            />
          )}
        </div>

        {/* Right rail */}
        <div className="flex w-[330px] shrink-0 flex-col gap-5">
          {loading ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-4 w-full" />
            </section>
          ) : !reserve.isReal && !empty && state.status !== 'signed-out' ? (
            // Signed in, no sales yet — say so instead of showing demo numbers.
            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('home.taxReserve')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('home.noSalesYet')}</p>
              <MoreLink href="/tax">{t('home.openTaxView')}</MoreLink>
            </section>
          ) : empty ? (
            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('home.taxReserve')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('home.noSalesYet')}</p>
            </section>
          ) : (
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.taxReserveYear', { year: reserve.year })}
            </h2>
            <p dir="ltr" className="private self-start text-[30px] font-semibold tracking-tight text-foreground tabular-nums">
              {sym}
              {fmtNum(reserve.due, nl)}
            </p>
            {!reserve.isReal && (
              <>
                <ReserveBar held={data.tax.heldInCash} due={data.tax.due} />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{t('home.inCash', { amount: fmtNum(data.tax.heldInCash, nl) })}</span>
                  <span>{t('home.short', { amount: fmtNum(data.tax.short, nl) })}</span>
                </div>
              </>
            )}
            <div className="h-px bg-border" />
            <div className="flex flex-col gap-2.5 text-[13px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.realizedNet')}</span>
                <span dir="ltr" className="private text-foreground">{fmtNum(reserve.net, nl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.lossCarriedIn')}</span>
                <span dir="ltr" className="private text-foreground">{fmtNum(-reserve.carried, nl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.taxableAt', { rate: taxRate })}</span>
                <span dir="ltr" className="private text-foreground">{fmtNum(reserve.taxable, nl)}</span>
              </div>
            </div>
            <MoreLink href="/tax">{t('home.openTaxView')}</MoreLink>
          </section>
          )}

          <WatchlistCard marketId={marketId} />

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.upcoming')}
            </h2>
            <div className="flex justify-between">
              <span className="text-sm text-foreground">{t('home.earnings', { company: 'NVIDIA' })}</span>
              <span className="text-[13px] text-muted-foreground">{fmtDate('2026-08-26', locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-foreground">{t('home.earnings', { company: 'AMD' })}</span>
              <span className="text-[13px] text-muted-foreground">{fmtDate('2026-09-03', locale)}</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
