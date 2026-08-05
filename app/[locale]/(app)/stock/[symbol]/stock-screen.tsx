'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Menu, Search, Star } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MoreLink } from '@/components/more-link';
import { SessionBadge, SessionStatus } from '@/components/session-indicator';
import { LineChart, Sparkline } from '@/components/charts';
import { PriceChart } from '@/components/price-chart';
import { useChart, useQuotes, useSummary } from '@/components/use-market-data';
import type { ChartRange } from '@/src/market-data/types';
import { getMarket } from '@/src/markets/registry';
import { getDemoHolding, getDemoStock } from '@/src/demo/data';
import { fmtCompact, fmtDate, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const tabs = ['summary', 'news', 'analysis', 'financials'] as const;
type Tab = (typeof tabs)[number];
const mobileRanges = ['1D', '1M', '6M', 'YTD', '1Y', '5Y', 'Max'] as const;
const desktopRanges = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y'] as const;
const rangeMap: Record<string, ChartRange> = {
  '1D': '1d',
  '5D': '5d',
  '1M': '1mo',
  '6M': '6mo',
  YTD: 'ytd',
  '1Y': '1y',
  '5Y': '5y',
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

  // Live data overlays the demo fallback as it arrives (Phase 1).
  const { quotes } = useQuotes([symbol]);
  const live = quotes[symbol];
  const { data: series } = useChart(symbol, rangeMap[range] ?? '1mo');
  const { data: summary } = useSummary(symbol);

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
    <div dir="ltr" className="flex gap-0.5 rounded-lg border border-border bg-background p-[3px]">
      {list.map((r) => (
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
  );

  const tabRow = (
    <div className="flex gap-5 border-b border-border px-4 md:gap-[26px] md:px-7">
      {tabs.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={cn(
            'pb-2 text-sm md:pb-3',
            tab === key
              ? '-mb-px border-b-2 border-brand font-semibold text-foreground'
              : 'text-muted-foreground',
          )}
        >
          {t(key)}
        </button>
      ))}
    </div>
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
          <span dir="ltr" className="text-xl font-semibold text-foreground tabular-nums">
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

  const financialsCard = (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('revenueVsEarnings')}
        </h2>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-1.5 md:flex">
            <span className="size-[9px] rounded-[2px] bg-primary" />
            <span className="text-xs text-muted-foreground">{t('revenue')}</span>
          </span>
          <span className="hidden items-center gap-1.5 md:flex">
            <span className="size-[9px] rounded-[2px] bg-chart-2" />
            <span className="text-xs text-muted-foreground">{t('earnings')}</span>
          </span>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground">
            {t('annual')}
          </span>
        </div>
      </div>
      <div dir="ltr" className="flex gap-3.5">
        <div className="relative h-[150px] w-[46px] shrink-0 text-[11px] text-muted-foreground tabular-nums">
          <span className="absolute -top-1.5 end-0">${stock.financialsMax}B</span>
          <span className="absolute top-[69px] end-0">${stock.financialsMax / 2}B</span>
          <span className="absolute -bottom-1.5 end-0">$0B</span>
        </div>
        <div className="relative flex-1">
          {[0, 75, 150].map((y) => (
            <div key={y} className="absolute inset-x-0 h-px bg-border" style={{ top: y }} />
          ))}
          <div className="flex gap-5">
            {stock.financials.map((f) => (
              <div key={f.label} className="flex flex-1 flex-col items-center gap-2.5">
                <div className="flex h-[150px] w-full items-end justify-center gap-2">
                  <div
                    className="w-8 bg-primary md:w-11"
                    style={{ height: (f.revenue / stock.financialsMax) * 150 }}
                  />
                  <div
                    className="w-8 bg-chart-2 md:w-11"
                    style={{ height: (f.earnings / stock.financialsMax) * 150 }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 md:hidden">
        <span className="flex items-center gap-1.5">
          <span className="size-[9px] rounded-[2px] bg-primary" />
          <span className="text-xs text-subtle">{t('revenue')}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-[9px] rounded-[2px] bg-chart-2" />
          <span className="text-xs text-subtle">{t('earnings')}</span>
        </span>
      </div>
    </section>
  );

  const comingSoon = (
    <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
      {t('comingSoon')}
    </section>
  );

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile ---------- */}
      <div className="flex flex-col md:hidden">
        <div className="flex items-center gap-3 px-4 pt-2 pb-2.5">
          <button type="button" onClick={() => router.back()} aria-label={t('summary')}>
            <ArrowLeft className="size-[18px] text-foreground rtl:-scale-x-100" aria-hidden />
          </button>
          <div className="flex flex-1 items-baseline gap-2" dir="ltr">
            <span className="text-[17px] font-bold text-foreground">{stock.symbol}</span>
            <span className="text-[15px] text-foreground tabular-nums">{fmtNum(price, nl)}</span>
            <span className={cn('text-[13px] tabular-nums', up ? 'text-gain' : 'text-loss')}>
              {fmtSigned(change, nl)} ({fmtPct(changePct, nl)})
            </span>
          </div>
          <Star className="size-4 text-brand" fill="currentColor" aria-hidden />
          <Search className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <SessionStatus marketId={marketId} className="px-4 pb-2.5" />
        {tabRow}

        <div className="flex flex-col gap-3.5 p-4 pb-[104px]">
          {tab === 'summary' && (
            <>
              <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-3 pt-4 pb-3">
                {series && series.points.length > 0 ? (
                  <PriceChart
                    points={series.points}
                    up={up}
                    height={150}
                    intraday={series.interval.endsWith('m')}
                    timezone={series.timezone}
                    fullDay={range === '1D'}
                  />
                ) : (
                  <LineChart points={stock.chart} up={up} height={150} viewH={250} gridlines={[233]} />
                )}
                <div dir="ltr" className="flex justify-between px-1">
                  {mobileRanges.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[13px]',
                        r === range
                          ? 'bg-secondary font-semibold text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>
              {positionCard}
              <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('keyStats')}
                </h2>
                <div className="grid grid-cols-2 gap-3 text-[13px] tabular-nums">
                  <Row label={t('open')} value={fmtNum(stats.open, nl)} />
                  <Row label={t('mktCap')} value={stats.marketCap} />
                  <Row label={t('dayRange')} value={`${fmtNum(stats.dayLow, nl, 1)}–${fmtNum(stats.dayHigh, nl, 1)}`} />
                  <Row label={t('pe')} value={fmtNum(stats.pe, nl, 1)} />
                </div>
              </section>
            </>
          )}
          {tab === 'financials' && (
            <>
              {financialsCard}
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
          {(tab === 'news' || tab === 'analysis') && comingSoon}
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
            <button type="button" className="rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] text-subtle">
              {t('watchlistBtn')}
            </button>
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
            {tab === 'financials' && financialsCard}
            {(tab === 'news' || tab === 'analysis') && comingSoon}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span dir="ltr" className="text-foreground">{value}</span>
    </div>
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
        className={cn('self-start text-[15px] text-foreground', gain && 'text-gain', loss && 'text-loss')}
      >
        {value}
      </span>
    </div>
  );
}
