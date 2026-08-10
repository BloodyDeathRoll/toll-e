'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Menu, Share2 } from 'lucide-react';
import { useSymbolWatchlist, WatchlistMenuButton, WatchlistStar } from '@/components/watchlist-star';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { SearchBox } from '@/components/app-shell/search-box';
import { MoreLink } from '@/components/more-link';
import { SessionBadge } from '@/components/session-indicator';
import { LineChart, Sparkline } from '@/components/charts';
import { ChangePill, AfterHours } from '@/components/quote-bits';
import { UnderlineTabs } from '@/components/underline-tabs';
import { PriceChart } from '@/components/price-chart';
import {
  useAnalysis,
  useChart,
  useFinancials,
  useNews,
  useQuotes,
  useSummary,
} from '@/components/use-market-data';
import type { ChartRange, StockAnalysis, StockFinancials } from '@/src/market-data/types';
import { getMarket } from '@/src/markets/registry';
import { getDemoHolding, getDemoStock } from '@/src/demo/data';
import { fmtCompact, fmtDate, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const tabs = ['summary', 'news', 'analysis', 'financials'] as const;
type Tab = (typeof tabs)[number];
const mobileRanges = ['1D', '1W', '1M', '1Y', 'YTD', 'All'] as const;
const desktopRanges = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y'] as const;
const rangeMap: Record<string, ChartRange> = {
  '1D': '1d',
  '1W': '5d',
  '5D': '5d',
  '1M': '1mo',
  '6M': '6mo',
  YTD: 'ytd',
  '1Y': '1y',
  '5Y': '5y',
  All: 'max',
  Max: 'max',
};

export function StockScreen({ symbol }: { symbol: string }) {
  const t = useTranslations('stock');
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const stock = getDemoStock(symbol);
  const holding = getDemoHolding(marketId, symbol) ?? getDemoHolding(marketId === 'US' ? 'IL' : 'US', symbol);
  const [tab, setTab] = useState<Tab>('summary');
  const [range, setRange] = useState('1D');
  const [finPeriod, setFinPeriod] = useState<'annual' | 'quarterly'>('annual');

  // Deep-linkable tabs (?tab=news) — read after mount so SSR markup stays stable.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && (tabs as readonly string[]).includes(wanted)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL-derived init
      setTab(wanted as Tab);
    }
  }, []);

  // Live data overlays the demo fallback as it arrives (Phase 1).
  const { quotes } = useQuotes([symbol]);
  const live = quotes[symbol];
  const { data: series } = useChart(symbol, rangeMap[range] ?? '1mo');
  const { data: summary } = useSummary(symbol);
  // Tab payloads are fetched lazily — only once their tab is opened (the
  // revenue/earnings card also shows on the desktop summary tab).
  const news = useNews(symbol, tab === 'news');
  const analysis = useAnalysis(symbol, tab === 'analysis');
  const financials = useFinancials(symbol, tab === 'financials' || tab === 'summary');
  const wl = useSymbolWatchlist(symbol);

  const price = live?.price ?? stock.price;
  const change = live?.change ?? stock.change;
  const changePct = live?.changePct ?? stock.changePct;
  const stats = {
    open: live?.open ?? stock.stats.open,
    dayLow: live?.dayLow ?? stock.stats.dayLow,
    dayHigh: live?.dayHigh ?? stock.stats.dayHigh,
    wk52Low: live?.wk52Low ?? summary?.stats.wk52Low ?? stock.stats.wk52Low,
    wk52High: live?.wk52High ?? summary?.stats.wk52High ?? stock.stats.wk52High,
    volume: live?.volume !== undefined ? fmtCompact(live.volume, nl) : stock.stats.volume,
    marketCap:
      (live?.marketCap ?? summary?.stats.marketCap) !== undefined
        ? fmtCompact((live?.marketCap ?? summary?.stats.marketCap) as number, nl)
        : stock.stats.marketCap,
    pe: summary?.stats.peTtm ?? stock.stats.pe,
    eps: summary?.stats.epsTtm ?? stock.stats.eps,
    divYieldPct: summary?.stats.dividendYieldPct ?? stock.stats.divYieldPct,
    beta: summary?.stats.beta ?? stock.stats.beta,
  };
  const headline = {
    name: summary?.name ?? stock.name,
    exchange: summary?.exchange ?? stock.exchange,
    sector: summary?.sector ?? stock.sector,
  };
  const eventDate = summary?.nextEarningsDate ?? stock.nextEvent.date;
  const up = changePct >= 0;

  // Depends on the clock — resolved after mount so SSR markup stays stable.
  const [daysOut, setDaysOut] = useState(0);
  useEffect(() => {
    const target = new Date(`${eventDate}T00:00:00`).getTime();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional clock-derived init
    setDaysOut(Math.max(0, Math.ceil((target - Date.now()) / 86_400_000)));
  }, [eventDate]);
  const eventTitle = locale === 'he' ? stock.nextEvent.titleHe : stock.nextEvent.title;
  const daysGain = holding ? holding.shares * change : 0;

  const rangePills = (list: readonly string[]) => (
    <div dir="ltr" className="flex gap-1">
      {list.map((r) => (
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
  );

  const tabRow = (
    <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} label={(k) => t(k)} className="px-7" />
  );

  const positionCard = holding && (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {t('yourPosition')}
      </h2>
      <div className="grid grid-cols-2 gap-3 tabular-nums">
        <PositionCell label={t('shares')} value={fmtNum(holding.shares, nl, 1)} />
        <PositionCell label={t('avgCost')} value={fmtNum(holding.avgCost, nl)} />
        <PositionCell label={t('marketValue')} value={fmtNum(holding.marketValue, nl)} />
        <PositionCell label={t('totalCost')} value={fmtNum(holding.shares * holding.avgCost, nl)} />
        <PositionCell label={t('totalGain')} value={fmtSigned(holding.totalGain, nl)} gain={holding.totalGain >= 0} loss={holding.totalGain < 0} />
        <PositionCell label={t('daysGain')} value={fmtSigned(daysGain, nl)} gain={daysGain >= 0} loss={daysGain < 0} />
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">{t('taxIfSoldAll')}</span>
          <span dir="ltr" className="private text-xl font-semibold text-foreground tabular-nums">
            {sym}
            {fmtNum(holding.taxIfSold, nl)}
          </span>
        </div>
        <span className="max-w-[150px] text-end text-xs leading-snug text-faint">
          {t('taxIfSoldNote', { rate: 25, gain: fmtNum(holding.totalGain, nl) })}
        </span>
      </div>
    </section>
  );

  // Revenue vs earnings: live financials once loaded; demo bars only while
  // the request is in flight (so signed-out showcase still paints instantly).
  const finSeries =
    finPeriod === 'quarterly'
      ? financials.data?.revenueEarnings.quarterly
      : financials.data?.revenueEarnings.yearly;
  const finRows =
    finSeries !== undefined
      ? finSeries.slice(-4)
      : financials.stale
        ? []
        : stock.financials.map((f) => ({ label: f.label, revenue: f.revenue * 1e9, earnings: f.earnings * 1e9 }));
  const finSym = currencySign(financials.data?.currency ?? 'USD');

  const legend = (extra?: string) => (
    <div className={cn('flex items-center gap-4', extra)}>
      <span className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] bg-primary" />
        <span className="text-xs text-muted-foreground">{t('revenue')}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-[9px] rounded-[2px] bg-chart-2" />
        <span className="text-xs text-muted-foreground">{t('earnings')}</span>
      </span>
    </div>
  );

  const financialsCard = (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('revenueVsEarnings')}
        </h2>
        <div className="flex items-center gap-4">
          {legend('hidden md:flex')}
          <button
            type="button"
            onClick={() => setFinPeriod(finPeriod === 'annual' ? 'quarterly' : 'annual')}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
          >
            {t(finPeriod)}
          </button>
        </div>
      </div>
      {finRows.length > 0 ? (
        <>
          <RevEarnBars rows={finRows} sym={finSym} nl={nl} />
          {legend('md:hidden')}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {financials.stale && !financials.data ? t('loadFailed') : t('noFinancials')}
        </p>
      )}
    </section>
  );

  const newsContent = !news.data ? (
    news.stale ? (
      <CardMsg>{t('loadFailed')}</CardMsg>
    ) : (
      <CardSkeleton rows={5} />
    )
  ) : news.data.news.length === 0 ? (
    <CardMsg>{t('noNews')}</CardMsg>
  ) : (
    <section className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {news.data.news.map((n) => (
        <a
          key={n.id}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3.5 p-4 hover:bg-well"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
              {n.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {n.publisher} · {relTime(n.publishedAt, locale)}
            </span>
          </div>
          {n.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- remote Yahoo CDN thumbs, no next/image domain config
            <img src={n.thumbnail} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          )}
        </a>
      ))}
    </section>
  );

  const hasAnalysis =
    analysis.data &&
    (analysis.data.recommendationTrend.length > 0 ||
      analysis.data.target !== undefined ||
      analysis.data.upgrades.length > 0);
  const analysisContent = !analysis.data ? (
    analysis.stale ? (
      <CardMsg>{t('loadFailed')}</CardMsg>
    ) : (
      <CardSkeleton rows={6} />
    )
  ) : !hasAnalysis ? (
    <CardMsg>{t('noAnalysis')}</CardMsg>
  ) : (
    <>
      {analysis.data.recommendationTrend.length > 0 && <RecommendationCard data={analysis.data} />}
      {analysis.data.target && (
        <TargetCard
          target={analysis.data.target}
          sym={currencySign(live?.currency ?? summary?.currency ?? market.currency)}
          nl={nl}
        />
      )}
      {analysis.data.upgrades.length > 0 && <UpgradesCard upgrades={analysis.data.upgrades} />}
    </>
  );

  const epsCard = financials.data && financials.data.epsHistory.length > 0 && (
    <EpsBeatsCard eps={financials.data.epsHistory} nl={nl} />
  );
  const holdersCard = financials.data && (
    <HoldersCard holders={financials.data.holders} nl={nl} />
  );

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile (Figma Stock summary frame) ---------- */}
      <div className="flex flex-col md:hidden">
        <div className="flex items-center gap-4 p-6 pb-4">
          <button type="button" onClick={() => router.back()} aria-label={t('summary')}>
            <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
          </button>
          <SearchBox
            className="min-w-0 flex-1"
            inputClassName="h-[43px] rounded-[20px] border-none bg-well ps-11 text-base font-medium"
            iconClassName="start-4 size-4"
          />
          <WatchlistStar wl={wl} className="size-6" />
          <button
            type="button"
            aria-label={t('share')}
            onClick={() => {
              if (navigator.share) void navigator.share({ url: window.location.href, title: stock.symbol });
            }}
          >
            <Share2 className="size-6 text-foreground" aria-hidden />
          </button>
        </div>
        <UnderlineTabs tabs={tabs} value={tab} onChange={setTab} label={(k) => t(k)} grow className="mx-6" />

        <div className="flex flex-col pb-[104px]">
          {tab === 'summary' && (
            <>
              {/* Title + price block */}
              <section className="flex flex-col gap-4 border-b border-border px-6 py-6">
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xl font-bold tracking-tight text-foreground">{stock.symbol}</span>
                  <span className="text-base text-foreground">{headline.name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-0.5" dir="ltr">
                    <span className="text-xl font-medium text-foreground tabular-nums">{fmtNum(price, nl)}</span>
                    <ChangePill pct={changePct} numberLocale={nl} className="ms-0.5" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {live?.asOf
                      ? t('atClose', { time: new Date(live.asOf).toLocaleString(locale, { hour: '2-digit', minute: '2-digit' }) })
                      : `${headline.exchange} · ${live?.currency ?? market.currency}`}
                  </span>
                </div>
                {live?.extended && (
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-0.5" dir="ltr">
                      <span className="text-xl font-medium text-foreground tabular-nums">
                        {fmtNum(live.extended.price, nl)}
                      </span>
                      <ChangePill pct={live.extended.changePct} numberLocale={nl} className="ms-0.5" />
                    </span>
                    <AfterHours quote={live} numberLocale={nl} />
                  </div>
                )}
              </section>

              {/* Chart + ranges */}
              <section className="flex flex-col gap-2.5 pt-4">
                <div className="px-2">
                  {series && series.points.length > 0 ? (
                    <PriceChart
                      points={series.points}
                      up={up}
                      height={182}
                      intraday={series.interval.endsWith('m')}
                      timezone={series.timezone}
                      fullDay={range === '1D'}
                    />
                  ) : (
                    <LineChart points={stock.chart} up={up} height={182} viewH={250} gridlines={[233]} />
                  )}
                </div>
                <div dir="ltr" className="flex gap-3 px-6">
                  {mobileRanges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        'flex-1 rounded-[20px] px-1 py-2.5 text-sm font-bold',
                        r === range ? 'bg-primary text-primary-foreground' : 'text-foreground/40',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>

              {/* Your position */}
              {holding && (
                <section className="flex flex-col gap-6 border-b border-border p-6">
                  <h2 className="text-xs uppercase text-muted-foreground">{t('yourPosition')}</h2>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('daysGain')}</span>
                    <span dir="ltr" className={cn('private text-base font-bold tabular-nums', daysGain >= 0 ? 'text-gain' : 'text-loss')}>
                      {fmtSigned(daysGain, nl)} ({fmtPct(changePct, nl)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('totalGain')}</span>
                    <span dir="ltr" className={cn('private text-base font-bold tabular-nums', holding.totalGain >= 0 ? 'text-gain' : 'text-loss')}>
                      {fmtSigned(holding.totalGain, nl)} ({fmtPct(holding.totalGainPct ?? 0, nl)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">{t('shares')}</span>
                      <span className="private text-base font-medium text-foreground">{fmtNum(holding.shares, nl, 0)}</span>
                    </span>
                    <span className="flex flex-col gap-2">
                      <span className="text-xs text-muted-foreground">{t('avgCost')}</span>
                      <span dir="ltr" className="private text-base font-medium text-foreground">{fmtNum(holding.avgCost, nl)}</span>
                    </span>
                    <span className="flex flex-col items-end gap-2">
                      <span className="text-xs text-muted-foreground">{t('marketValue')}</span>
                      <span dir="ltr" className="private text-base font-medium text-foreground">{fmtNum(holding.marketValue, nl)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('taxIfSoldAll')}</span>
                    <span dir="ltr" className="private text-base font-medium text-foreground tabular-nums">
                      {sym}
                      {fmtNum(holding.taxIfSold, nl)}
                    </span>
                  </div>
                </section>
              )}

              {/* Key statistics */}
              <section className="flex flex-col gap-6 p-6">
                <h2 className="text-xs uppercase text-muted-foreground">{t('keyStats')}</h2>
                <RangeSlider
                  low={stats.dayLow}
                  high={stats.dayHigh}
                  value={price}
                  label={t('dayRange')}
                  nl={nl}
                />
                <RangeSlider
                  low={stats.wk52Low}
                  high={stats.wk52High}
                  value={price}
                  label={t('wk52Range')}
                  nl={nl}
                />
                <div className="flex items-center justify-between tabular-nums">
                  <StatCell label={t('prevClose')} value={live?.previousClose !== undefined ? fmtNum(live.previousClose, nl) : '—'} />
                  <StatCell label={t('open')} value={fmtNum(stats.open, nl)} end />
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <StatCell label={t('vol')} value={stats.volume} />
                  <StatCell
                    label={t('avgVol')}
                    value={live?.avgVolume !== undefined ? fmtCompact(live.avgVolume, nl) : '—'}
                    end
                  />
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <StatCell label={t('pe')} value={fmtNum(stats.pe, nl, 1)} />
                  <StatCell label={t('mktCap')} value={stats.marketCap} end />
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <StatCell label={t('beta')} value={fmtNum(stats.beta, nl)} />
                  <StatCell label={t('divYield')} value={`${fmtNum(stats.divYieldPct, nl)}%`} end />
                </div>
                <div className="flex items-center justify-between tabular-nums">
                  <StatCell label={t('earningsDate')} value={fmtDate(eventDate, locale)} />
                </div>
              </section>
            </>
          )}
          {tab === 'financials' && (
            <>
              {!financials.data && !financials.stale && <CardSkeleton rows={5} />}
              {epsCard}
              {financialsCard}
              {holdersCard}
              <section className="overflow-hidden rounded-2xl border border-border bg-card">
                <h2 className="px-4 pt-3.5 pb-2 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('historicalPrices')}
                </h2>
                <div dir="ltr" className="flex items-center gap-2.5 px-4 pb-2.5">
                  <div className="min-w-0 flex-1">
                    <Sparkline points={stock.wk52Spark} up width={240} height={72} className="w-full" />
                  </div>
                  <div className="flex h-[72px] flex-col justify-between text-[13px] text-foreground tabular-nums">
                    <span>{fmtNum(stats.wk52High, nl)}</span>
                    <span>{fmtNum(stats.wk52Low, nl)}</span>
                  </div>
                </div>
                <div className="flex justify-between px-4 pb-3 text-xs text-muted-foreground">
                  <span>{fmtDate('2025-08-04', locale)}</span>
                  <span>{fmtDate('2026-08-04', locale)}</span>
                </div>
                <div className="flex justify-end border-t border-border bg-well px-4 py-2.5">
                  <MoreLink href={`/stock/${stock.symbol}`}>{t('viewAll')}</MoreLink>
                </div>
              </section>
              <section className="flex flex-col gap-[7px] rounded-2xl border border-border bg-card p-5">
                <h2 className="pb-1 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('corporateEvents')}
                </h2>
                <span className="text-[13px] text-muted-foreground">
                  {fmtDate(eventDate, locale)} · {t('upcomingTag')}
                </span>
                <span className="text-[15px] font-semibold text-foreground">
                  {stock.name.split(' ')[0]} {eventTitle}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {t('daysOut', { days: daysOut })} · <span className="text-brand">{t('setReminder')}</span>
                </span>
              </section>
            </>
          )}
          {tab === 'news' && newsContent}
          {tab === 'analysis' && analysisContent}
        </div>

        {/* Floating CTA above the tab bar */}
        <div className="fixed inset-x-4 bottom-[88px] z-30 flex gap-2.5 md:hidden">
          <Link
            href={`/transactions/new?symbol=${stock.symbol}`}
            className="flex h-[46px] flex-1 items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {t('addTransaction')}
          </Link>
          <span className="flex size-[46px] items-center justify-center rounded-lg border border-border bg-card text-subtle">
            <Menu className="size-4" aria-hidden />
          </span>
        </div>
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden flex-1 flex-col md:flex">
        <div className="flex items-end justify-between px-7 pt-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground">
              {headline.name} · {headline.exchange} · {headline.sector}
            </span>
            <div className="flex items-center gap-3.5">
              <div className="flex items-baseline gap-3.5" dir="ltr">
                <span className="text-[28px] font-bold tracking-tight text-foreground">{stock.symbol}</span>
                <span className="text-[28px] font-semibold text-foreground tabular-nums">
                  {fmtNum(price, nl)}
                </span>
                <span className={cn('text-[15px] tabular-nums', up ? 'text-gain' : 'text-loss')}>
                  {fmtSigned(change, nl)} ({fmtPct(changePct, nl)})
                </span>
              </div>
              <SessionBadge marketId={marketId} />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <WatchlistMenuButton wl={wl} />
            <button type="button" className="rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] text-subtle">
              {t('setAlert')}
            </button>
            <Link
              href={`/transactions/new?symbol=${stock.symbol}`}
              className="rounded-lg bg-primary px-[18px] py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
            >
              {t('addTransaction')}
            </Link>
          </div>
        </div>
        <div className="mt-4">{tabRow}</div>

        <div className="flex flex-1 gap-5 p-7 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {tab === 'summary' && (
              <>
                <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
                  <div className="flex items-center justify-between">
                    {rangePills(desktopRanges)}
                    <div dir="ltr" className="flex gap-[18px] text-xs text-muted-foreground tabular-nums">
                      <span>
                        {t('open')} <span className="text-foreground">{fmtNum(stats.open, nl)}</span>
                      </span>
                      <span>
                        {t('day')}{' '}
                        <span className="text-foreground">
                          {fmtNum(stats.dayLow, nl)} – {fmtNum(stats.dayHigh, nl)}
                        </span>
                      </span>
                      <span>
                        {t('wk52')}{' '}
                        <span className="text-foreground">
                          {fmtNum(stats.wk52Low, nl)} – {fmtNum(stats.wk52High, nl)}
                        </span>
                      </span>
                      <span>
                        {t('vol')} <span className="text-foreground">{stats.volume}</span>
                      </span>
                    </div>
                  </div>
                  {series && series.points.length > 0 ? (
                    <PriceChart
                      points={series.points}
                      up={up}
                      height={250}
                      intraday={series.interval.endsWith('m')}
                      timezone={series.timezone}
                      fullDay={range === '1D'}
                    />
                  ) : (
                    <LineChart points={stock.chart} up={up} height={250} viewH={250} gridlines={[40, 120, 200]} />
                  )}
                </section>
                {financialsCard}
              </>
            )}
            {tab === 'financials' && (
              <>
                {!financials.data && !financials.stale && <CardSkeleton rows={5} />}
                {epsCard}
                {financialsCard}
                {holdersCard}
              </>
            )}
            {tab === 'news' && newsContent}
            {tab === 'analysis' && analysisContent}
          </div>

          <div className="flex w-[330px] shrink-0 flex-col gap-5">
            {positionCard}
            <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('keyStats')}
              </h2>
              <div className="flex flex-col gap-3 text-[13px] tabular-nums">
                <Row label={t('marketCap')} value={stats.marketCap} />
                <Row label={t('peTtm')} value={fmtNum(stats.pe, nl, 1)} />
                <Row label={t('epsTtm')} value={fmtNum(stats.eps, nl)} />
                <Row label={t('divYield')} value={`${fmtNum(stats.divYieldPct, nl)}%`} />
                <Row label={t('beta')} value={fmtNum(stats.beta, nl)} />
              </div>
            </section>
            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('nextEvent')}
              </h2>
              <span className="text-[15px] text-foreground">
                {eventTitle} · {fmtDate(eventDate, locale)}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {t('daysOut', { days: daysOut })} · <span className="text-brand">{t('setReminder')}</span>
              </span>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Key-statistics range: hairline with a marker at the current value. */
function RangeSlider({
  low,
  high,
  value,
  label,
  nl,
}: {
  low: number;
  high: number;
  value: number;
  label: string;
  nl: string;
}) {
  const pct = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <div className="flex flex-col gap-2">
      <div dir="ltr" className="flex items-center justify-between text-xs font-medium tabular-nums">
        <span className="text-foreground">{fmtNum(low, nl)}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{fmtNum(high, nl)}</span>
      </div>
      <div dir="ltr" className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/30" />
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCell({ label, value, end }: { label: string; value: string; end?: boolean }) {
  return (
    <span className={cn('flex flex-col gap-2', end && 'items-end')}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span dir="ltr" className="text-base font-medium text-foreground">{value}</span>
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span dir="ltr" className="text-foreground">{value}</span>
    </div>
  );
}

const SIGNS: Record<string, string> = { USD: '$', ILS: '₪', EUR: '€', GBP: '£' };
function currencySign(code: string) {
  return SIGNS[code] ?? `${code} `;
}

function relTime(ts: number, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  const mins = Math.round((ts - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  if (Math.abs(mins) < 24 * 60) return rtf.format(Math.round(mins / 60), 'hour');
  return rtf.format(Math.round(mins / (24 * 60)), 'day');
}

function CardMsg({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
      {children}
    </section>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-well"
          style={{ width: `${100 - ((i * 23) % 45)}%` }}
        />
      ))}
    </section>
  );
}

/** Grouped revenue/earnings bars; negative earnings hang below the zero line. */
function RevEarnBars({
  rows,
  sym,
  nl,
}: {
  rows: Array<{ label: string; revenue: number; earnings: number }>;
  sym: string;
  nl: string;
}) {
  const H = 150;
  const max = Math.max(...rows.flatMap((r) => [r.revenue, r.earnings]), 1);
  const min = Math.min(0, ...rows.map((r) => r.earnings));
  const scale = H / (max - min);
  const zeroTop = max * scale;

  const bar = (v: number, cls: string) => {
    const h = Math.max(2, Math.abs(v) * scale);
    return (
      <div className="relative h-full w-6 md:w-11">
        <div
          className={cn('absolute inset-x-0', v < 0 ? 'bg-loss' : cls)}
          style={v >= 0 ? { top: zeroTop - h, height: h } : { top: zeroTop, height: h }}
        />
      </div>
    );
  };

  return (
    <div dir="ltr" className="flex gap-3.5">
      <div className="relative h-[150px] w-[52px] shrink-0 text-[11px] text-muted-foreground tabular-nums">
        <span className="absolute -top-1.5 end-0">{sym}{fmtCompact(max, nl)}</span>
        <span className="absolute end-0" style={{ top: zeroTop - 6 }}>{sym}0</span>
        {min < 0 && <span className="absolute -bottom-1.5 end-0">-{sym}{fmtCompact(-min, nl)}</span>}
      </div>
      <div className="relative flex-1">
        {[0, zeroTop, ...(min < 0 ? [H] : [])].map((y) => (
          <div key={y} className="absolute inset-x-0 h-px bg-border" style={{ top: y }} />
        ))}
        <div className="flex gap-2 md:gap-5">
          {rows.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
              <div className="flex h-[150px] w-full justify-center gap-1.5 md:gap-2">
                {bar(f.revenue, 'bg-primary')}
                {bar(f.earnings, 'bg-chart-2')}
              </div>
              <span className="text-[11px] text-muted-foreground">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const RECO_SEGMENTS = [
  { key: 'strongSell', cls: 'bg-loss' },
  { key: 'sell', cls: 'bg-loss/50' },
  { key: 'hold', cls: 'bg-chart-2' },
  { key: 'buy', cls: 'bg-gain/50' },
  { key: 'strongBuy', cls: 'bg-gain' },
] as const;

function RecommendationCard({ data }: { data: StockAnalysis }) {
  const t = useTranslations('stock');
  const locale = useLocale();
  const periods = [...data.recommendationTrend].sort(
    (a, b) => parseInt(a.period) - parseInt(b.period),
  );
  const total = (p: (typeof periods)[number]) => p.strongBuy + p.buy + p.hold + p.sell + p.strongSell;
  const maxTotal = Math.max(...periods.map(total), 1);
  const latest = periods[periods.length - 1];
  const H = 140;
  const now = new Date();

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('recommendations')}
        </h2>
        {data.numberOfAnalysts !== undefined && (
          <span className="text-xs text-muted-foreground">
            {t('analystsCount', { count: data.numberOfAnalysts })}
          </span>
        )}
      </div>
      <div className="flex items-end gap-6">
        <div dir="ltr" className="flex flex-1 items-end justify-around gap-4">
          {periods.map((p) => {
            const label = new Date(now.getFullYear(), now.getMonth() + parseInt(p.period), 1)
              .toLocaleDateString(locale, { month: 'short' });
            return (
              <div key={p.period} className="flex w-10 flex-col items-center gap-2">
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-[3px]"
                  style={{ height: H }}
                >
                  {RECO_SEGMENTS.map((s) => (
                    <div
                      key={s.key}
                      className={s.cls}
                      style={{ height: (p[s.key] / maxTotal) * H }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          {[...RECO_SEGMENTS].reverse().map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-[9px] rounded-[2px]', s.cls)} />
              {t(s.key)}
              <span className="ms-auto ps-3 text-foreground tabular-nums">{latest[s.key]}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TargetCard({
  target,
  sym,
  nl,
}: {
  target: NonNullable<StockAnalysis['target']>;
  sym: string;
  nl: string;
}) {
  const t = useTranslations('stock');
  const lo = Math.min(target.low, target.current ?? target.low);
  const hi = Math.max(target.high, target.current ?? target.high);
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {t('priceTarget')}
      </h2>
      <div dir="ltr" className="flex flex-col gap-3 px-1">
        <div className="relative mt-2 h-1.5 rounded-full bg-well">
          <div
            className="absolute inset-y-0 rounded-full bg-border"
            style={{ left: pos(target.low), right: `calc(100% - ${pos(target.high)})` }}
          />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: pos(target.mean) }}
          />
          {target.current !== undefined && (
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-card"
              style={{ left: pos(target.current) }}
            />
          )}
        </div>
        <div className="flex justify-between text-[13px] tabular-nums">
          <span className="flex flex-col">
            <span className="text-muted-foreground">{t('targetLow')}</span>
            <span className="text-foreground">{sym}{fmtNum(target.low, nl)}</span>
          </span>
          <span className="flex flex-col items-center">
            <span className="text-muted-foreground">{t('targetAvg')}</span>
            <span className="font-semibold text-foreground">{sym}{fmtNum(target.mean, nl)}</span>
          </span>
          <span className="flex flex-col items-end">
            <span className="text-muted-foreground">{t('targetHigh')}</span>
            <span className="text-foreground">{sym}{fmtNum(target.high, nl)}</span>
          </span>
        </div>
        {target.current !== undefined && (
          <span className="text-xs text-muted-foreground">
            <span className="me-1.5 inline-block size-2.5 rounded-full border-2 border-brand align-middle" />
            {t('targetCurrent')} {sym}{fmtNum(target.current, nl)}
          </span>
        )}
      </div>
    </section>
  );
}

function UpgradesCard({ upgrades }: { upgrades: StockAnalysis['upgrades'] }) {
  const t = useTranslations('stock');
  const locale = useLocale();
  const actionCls: Record<string, string> = { up: 'text-gain', down: 'text-loss' };

  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
      <h2 className="pb-2 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {t('upgradesTitle')}
      </h2>
      <div className="flex flex-col divide-y divide-border">
        {upgrades.slice(0, 8).map((u, i) => (
          <div key={`${u.firm}-${u.date}-${i}`} className="flex items-center gap-3 py-2.5 text-[13px]">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-foreground">{u.firm}</span>
              <span className="text-xs text-muted-foreground">
                {/* bdi keeps the arrow order LTR while aligning with the locale's text start */}
                <bdi dir="ltr">
                  {u.fromGrade && u.fromGrade !== u.toGrade ? `${u.fromGrade} → ` : ''}
                  {u.toGrade}
                </bdi>
              </span>
            </div>
            <span className={cn('text-xs font-medium', actionCls[u.action] ?? 'text-muted-foreground')}>
              {t(`action_${u.action}` as Parameters<typeof t>[0])}
            </span>
            <span className="w-20 text-end text-xs text-muted-foreground tabular-nums">
              {fmtDate(new Date(u.date).toISOString().slice(0, 10), locale)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Estimate (hollow) vs actual (filled, gain/loss) EPS dots per quarter. */
function EpsBeatsCard({ eps, nl }: { eps: StockFinancials['epsHistory']; nl: string }) {
  const t = useTranslations('stock');
  const vals = eps.flatMap((q) => [q.actual, q.estimate]).filter((v): v is number => v !== undefined);
  if (vals.length === 0) return null;
  const H = 110;
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.18 || 1;
  const min = Math.min(...vals) - pad;
  const max = Math.max(...vals) + pad;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('epsBeats')}
        </h2>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-[9px] rounded-full border-[1.5px] border-chart-2" />
            {t('estimate')}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-[9px] rounded-full bg-gain" />
            {t('actual')}
          </span>
        </div>
      </div>
      <div dir="ltr" className="flex justify-around gap-3">
        {eps.slice(-4).map((q) => {
          const beat = q.actual !== undefined && q.estimate !== undefined && q.actual >= q.estimate;
          return (
            <div key={q.period} className="flex flex-col items-center gap-2">
              <div className="relative w-16" style={{ height: H }}>
                <div className="absolute inset-x-2 top-1/2 h-px bg-border" />
                {q.estimate !== undefined && (
                  <span
                    className="absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chart-2 bg-card"
                    style={{ top: y(q.estimate) }}
                    title={`${t('estimate')} ${fmtNum(q.estimate, nl)}`}
                  />
                )}
                {q.actual !== undefined && (
                  <span
                    className={cn(
                      'absolute left-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                      beat ? 'bg-gain' : 'bg-loss',
                    )}
                    style={{ top: y(q.actual) }}
                    title={`${t('actual')} ${fmtNum(q.actual, nl)}`}
                  />
                )}
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[11px] text-muted-foreground">{q.period}</span>
                {q.surprisePct !== undefined && (
                  <span className={cn('text-xs tabular-nums', q.surprisePct >= 0 ? 'text-gain' : 'text-loss')}>
                    {fmtPct(q.surprisePct, nl, 1)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HoldersCard({ holders, nl }: { holders: StockFinancials['holders']; nl: string }) {
  const t = useTranslations('stock');
  const hasBreakdown = holders.insidersPctHeld !== undefined || holders.institutionsPctHeld !== undefined;
  if (!hasBreakdown && holders.top.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {t('topHolders')}
      </h2>
      {hasBreakdown && (
        <div className="flex gap-3 text-[13px] tabular-nums">
          {holders.insidersPctHeld !== undefined && (
            <span className="rounded-lg bg-well px-3 py-1.5">
              <span className="text-muted-foreground">{t('insidersHeld')} </span>
              <span className="text-foreground" dir="ltr">{fmtNum(holders.insidersPctHeld, nl)}%</span>
            </span>
          )}
          {holders.institutionsPctHeld !== undefined && (
            <span className="rounded-lg bg-well px-3 py-1.5">
              <span className="text-muted-foreground">{t('institutionsHeld')} </span>
              <span className="text-foreground" dir="ltr">{fmtNum(holders.institutionsPctHeld, nl)}%</span>
            </span>
          )}
        </div>
      )}
      {holders.top.length > 0 && (
        <div className="flex flex-col">
          <div className="flex justify-between border-b border-border pb-2 text-xs text-muted-foreground">
            <span>{t('holderOrg')}</span>
            <span className="flex gap-6">
              <span className="w-16 text-end">{t('pctHeld')}</span>
              <span className="w-20 text-end">{t('holderValue')}</span>
            </span>
          </div>
          {holders.top.map((h) => (
            <div
              key={h.organization}
              className="flex items-center justify-between border-b border-border py-2 text-[13px] last:border-0"
            >
              <span className="min-w-0 truncate pe-3 text-foreground">{h.organization}</span>
              <span className="flex shrink-0 gap-6 tabular-nums">
                <span className="w-16 text-end text-foreground" dir="ltr">{fmtNum(h.pctHeld, nl)}%</span>
                <span className="w-20 text-end text-muted-foreground" dir="ltr">{fmtCompact(h.value, nl)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PositionCell({
  label,
  value,
  gain,
  loss,
}: {
  label: string;
  value: string;
  gain?: boolean;
  loss?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        dir="ltr"
        className={cn('private self-start text-[15px] text-foreground', gain && 'text-gain', loss && 'text-loss')}
      >
        {value}
      </span>
    </div>
  );
}
