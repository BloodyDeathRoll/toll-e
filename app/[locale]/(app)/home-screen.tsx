'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { useMarket } from '@/components/app-shell/market-context';
import { MoreLink } from '@/components/more-link';
import { HoldingsTable, positionRows } from '@/components/holdings-table';
import { PerformanceChart, type OverlayRow } from '@/components/performance-chart';
import { PortfolioChart } from '@/components/portfolio-chart';
import { RangePills, rangeToChart, type RangeOption } from '@/components/range-pills';
import { ChangePill, AfterHours } from '@/components/quote-bits';
import { DevLogin } from '@/components/dev-login';
import { GoogleButton } from '@/components/google-button';
import { Logo } from '@/components/logo';
import { ReserveBar } from '@/components/reserve-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkline, sessionFill, twoToneSpark } from '@/components/charts';
import { WatchlistAccordions } from '@/components/watchlist-accordions';
import { WatchlistCard } from '@/components/watchlist-card';
import type { ChartRange } from '@/src/market-data/types';
import { useCharts, useIndexQuotes, useQuotes } from '@/components/use-market-data';
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
  const [mobileRange, setMobileRange] = useState<RangeOption>('1D');
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
  const { quotes: indexQuotes } = useIndexQuotes(marketId);
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

  // Mobile design extras: live quotes (after-hours moon) and 1D sparklines
  // for the holdings rows and index cards.
  const holdingSymbols = overlayRows.map((r) => r.symbol);
  const { quotes: holdingQuotes } = useQuotes(holdingSymbols);
  const holdingCharts = useCharts(holdingSymbols, '1d');
  const indexSymbols = data.indexes.slice(0, 3).map((ix) => ix.symbol);
  const indexCharts = useCharts(indexSymbols, '1d');

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

  // Signed-out: the HP login frame — logo, tagline, Google and nothing else.
  // App chrome (header, tab bar) hides itself while there is no session.
  if (state.status === 'signed-out') {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <Logo />
        <p className="text-center text-2xl font-medium tracking-tight text-foreground">
          {t('auth.tagline')}
        </p>
        <GoogleButton />
        <DevLogin />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile (Figma HP frame) ---------- */}
      <div className="flex flex-col md:hidden">
        <AppHeader />

        {/* Portfolio value */}
        {loading && <div className="px-6">{valueSkeleton}</div>}
        {empty && <div className="px-6">{emptyCard}</div>}
        {!loading && !empty && (
          <>
            <section className="flex flex-col gap-1 px-6 pb-6">
              <p dir="ltr" className="private self-start text-[32px] font-bold tracking-tight text-foreground tabular-nums">
                {sym}
                {fmtNum(p.value, nl)}
              </p>
              <p className="private flex items-baseline gap-1">
                <span
                  dir="ltr"
                  className={cn('text-[22px] font-semibold tracking-tight tabular-nums', up ? 'text-gain' : 'text-loss')}
                >
                  {fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})
                </span>
                <span className="text-xs text-muted-foreground">{t('home.today')}</span>
              </p>
              <p className="private flex items-baseline gap-1">
                <span
                  dir="ltr"
                  className={cn(
                    'text-[22px] font-semibold tracking-tight tabular-nums',
                    p.allTimeChange >= 0 ? 'text-gain' : 'text-loss',
                  )}
                >
                  {fmtSigned(p.allTimeChange, nl)} ({fmtPct(p.allTimePct, nl)})
                </span>
                <span className="text-xs text-muted-foreground">{t('home.allTimeWord')}</span>
              </p>
            </section>

            {/* Full-bleed chart + range pills */}
            <PortfolioChart rows={overlayRows} range={rangeToChart[mobileRange]} marketId={marketId} />
            <RangePills value={mobileRange} onChange={setMobileRange} className="mt-2.5" />
          </>
        )}

        {/* Index trio */}
        <section className="flex gap-2.5 px-6 py-6">
          {data.indexes.slice(0, 3).map((ix) => {
            const live = indexQuotes[ix.symbol];
            const value = live?.price ?? ix.value;
            const pct = live?.changePct ?? ix.changePct;
            const ixSeries = indexCharts[ix.symbol];
            const closes = ixSeries?.points.map((pt) => pt.close) ?? [];
            const spark = closes.length > 1 ? twoToneSpark(closes.slice(-40), 20) : null;
            const ixFill = sessionFill(ixSeries?.points.slice(-40), market.calendar);
            return (
              <div
                key={ix.symbol}
                className="flex flex-1 flex-col gap-1 rounded-lg border border-border bg-card p-2.5"
              >
                <span className="text-sm font-medium text-foreground">{name(ix)}</span>
                {spark ? (
                  <Sparkline points={spark.points} baseline={spark.baseline} up={pct >= 0} fill={ixFill} width={90} height={20} />
                ) : (
                  <Sparkline points={ix.spark ?? []} up={pct >= 0} width={90} height={20} />
                )}
                <span dir="ltr" className="self-start text-sm font-medium text-foreground tabular-nums">
                  {fmtNum(value, nl)}
                </span>
                <span
                  dir="ltr"
                  className={cn('self-start text-sm font-medium tabular-nums', pct >= 0 ? 'text-gain' : 'text-loss')}
                >
                  {fmtPct(pct, nl)}
                </span>
              </div>
            );
          })}
        </section>

        {/* Holdings */}
        {loading && (
          <section className="flex flex-col gap-3 px-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </section>
        )}
        {!loading && !empty && (
          <section className="px-6 pb-6">
            <h2 className="pb-2.5 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.holdings')}
            </h2>
            {(rows ?? data.holdings).map((h) => {
              const quote = holdingQuotes[h.symbol];
              const hSeries = holdingCharts[h.symbol];
              const closes = hSeries?.points.map((pt) => pt.close) ?? [];
              const spark = closes.length > 1 ? twoToneSpark(closes.slice(-40), 20) : null;
              const hFill = sessionFill(hSeries?.points.slice(-40), market.calendar);
              const dayPct = quote?.changePct ?? h.dayChangePct;
              return (
                <Link
                  key={h.symbol}
                  href={`/stock/${h.symbol}`}
                  className="flex items-center justify-between gap-4 border-b border-border py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-bold text-foreground">{h.symbol}</span>
                    <span className="truncate text-xs text-foreground">
                      {name({ name: h.name ?? h.symbol, nameHe: (h as { nameHe?: string }).nameHe })}
                    </span>
                    <span className="text-xs text-foreground/80">
                      {t('home.sharesCount', { shares: fmtNum(h.shares, nl, 0) })}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-6">
                    {spark && (
                      <Sparkline
                        points={spark.points}
                        baseline={spark.baseline}
                        up={dayPct >= 0}
                        fill={hFill}
                        width={91}
                        height={20}
                      />
                    )}
                    <span className="private flex flex-col items-end gap-0.5">
                      <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                        {fmtNum(quote?.price ?? h.price, nl)}
                      </span>
                      <ChangePill pct={dayPct} numberLocale={nl} />
                      <AfterHours quote={quote} numberLocale={nl} />
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
        )}

        <WatchlistAccordions marketId={marketId} />
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
                <p dir="ltr" className="private self-start text-[32px] font-bold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(p.value, nl)}
                </p>
                <p className="private flex items-baseline gap-4 tabular-nums">
                  <span className={cn('text-lg font-semibold', up ? 'text-gain' : 'text-loss')}>
                    <span dir="ltr">{fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})</span>{' '}
                    <span className="text-xs font-normal text-muted-foreground">{t('home.today')}</span>
                  </span>
                  <span className={cn('text-lg font-semibold', p.allTimeChange >= 0 ? 'text-gain' : 'text-loss')}>
                    <span dir="ltr">{fmtSigned(p.allTimeChange, nl)} ({fmtPct(p.allTimePct, nl)})</span>{' '}
                    <span className="text-xs font-normal text-muted-foreground">{t('home.allTimeWord')}</span>
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <div dir="ltr" className="flex gap-1">
                  {ranges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        'rounded-[20px] px-3 py-1.5 text-xs font-bold',
                        r === range
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground/40 hover:text-foreground',
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
          ) : !reserve.isReal && !empty ? (
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
