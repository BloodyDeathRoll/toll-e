'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Search } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MarketMenu } from '@/components/app-shell/market-menu';
import { MoreLink } from '@/components/more-link';
import { HoldingsTable } from '@/components/holdings-table';
import { ReserveBar } from '@/components/reserve-bar';
import { LineChart, Sparkline } from '@/components/charts';
import { useIndexQuotes } from '@/components/use-market-data';
import { getMarket } from '@/src/markets/registry';
import { demo, demoWatchlists } from '@/src/demo/data';
import { fmtDate, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const ranges = ['1D', '1M', '6M', 'YTD', '1Y', 'All'] as const;

export function HomeScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const currencyLabel = locale === 'he' ? 'ש״ח' : market.currency;
  const [range, setRange] = useState<(typeof ranges)[number]>('1M');
  const { quotes: indexQuotes } = useIndexQuotes(marketId);
  const name = (x: { name: string; nameHe?: string }) =>
    locale === 'he' && x.nameHe ? x.nameHe : x.name;

  const p = data.portfolio;
  const up = p.dayChange >= 0;

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
          <MarketMenu />
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('nav.search')}
            className="h-10 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            disabled
          />
        </div>

        {/* Portfolio value */}
        <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.portfolioValue')}
            </h2>
            <span className="text-xs text-faint">
              {t('home.holdingsIn', { currency: currencyLabel })}
            </span>
          </div>
          <p dir="ltr" className="self-start text-[34px] font-semibold tracking-tight text-foreground tabular-nums">
            {sym}
            {fmtNum(p.value, nl)}
          </p>
          <p className={cn('flex gap-3.5 text-sm font-medium tabular-nums', up ? 'text-gain' : 'text-loss')}>
            <span>
              <span dir="ltr">{fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})</span>{' '}
              {t('home.today')}
            </span>
            <span>
              <span dir="ltr">{fmtPct(p.allTimePct, nl)}</span> {t('home.allWord')}
            </span>
          </p>
          <div className="my-1 h-px bg-border" />
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted-foreground">{t('home.taxReserve')}</span>
              <span dir="ltr" className="self-start text-xl font-semibold text-foreground tabular-nums">
                {sym}
                {fmtNum(data.tax.due, nl)}
              </span>
            </div>
            <MoreLink href="/tax">{t('home.taxView')}</MoreLink>
          </div>
        </section>

        {/* Index trio */}
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t(`home.indexesTitle.${marketId}`)}
            </h2>
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
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.holdings')}
            </h2>
            <span className="text-xs text-faint">{t('home.marketValue')}</span>
          </div>
          {data.holdings.slice(0, 3).map((h) => (
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
              <span className="flex flex-col items-end gap-0.5 tabular-nums">
                <span dir="ltr" className="text-[15px] text-foreground">{fmtNum(h.marketValue, nl)}</span>
                <span dir="ltr" className={cn('text-xs', h.dayChangePct >= 0 ? 'text-gain' : 'text-loss')}>
                  {fmtPct(h.dayChangePct, nl)} · {fmtPct(h.totalGainPct, nl)}
                </span>
              </span>
            </Link>
          ))}
          <div className="flex justify-end border-t border-border bg-well px-4 py-[11px]">
            <MoreLink href="/portfolio">{t('home.allTransactions')}</MoreLink>
          </div>
        </section>
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden flex-1 gap-5 p-7 md:flex">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* Portfolio chart card */}
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-6 py-[22px]">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('home.holdingsCurrency', { currency: currencyLabel })}
                </h2>
                <p dir="ltr" className="self-start text-[38px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(p.value, nl)}
                </p>
                <p className={cn('flex gap-4 text-sm tabular-nums', up ? 'text-gain' : 'text-loss')}>
                  <span>
                    <span dir="ltr">{fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})</span>{' '}
                    {t('home.today')}
                  </span>
                  <span>
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
                  className="rounded-lg bg-primary px-4 py-[9px] text-[13px] font-semibold text-primary-foreground hover:opacity-90"
                >
                  {t('nav.addTransaction')}
                </Link>
              </div>
            </div>
            <LineChart points={p.chart} up={up} height={150} gridlines={[146]} />
          </section>

          <HoldingsTable marketId={marketId} />
        </div>

        {/* Right rail */}
        <div className="flex w-[330px] shrink-0 flex-col gap-5">
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('home.taxReserveYear', { year: data.tax.year })}
            </h2>
            <p dir="ltr" className="self-start text-[30px] font-semibold tracking-tight text-foreground tabular-nums">
              {sym}
              {fmtNum(data.tax.due, nl)}
            </p>
            <ReserveBar held={data.tax.heldInCash} due={data.tax.due} />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{t('home.inCash', { amount: fmtNum(data.tax.heldInCash, nl) })}</span>
              <span>{t('home.short', { amount: fmtNum(data.tax.short, nl) })}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-col gap-2.5 text-[13px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.realizedNet')}</span>
                <span dir="ltr" className="text-foreground">
                  {fmtNum(data.tax.realizedGains - data.tax.realizedLosses, nl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.lossCarriedIn')}</span>
                <span dir="ltr" className="text-foreground">{fmtNum(-data.tax.carriedLoss, nl)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('home.taxableAt', { rate: data.tax.ratePct })}</span>
                <span dir="ltr" className="text-foreground">{fmtNum(data.tax.taxable, nl)}</span>
              </div>
            </div>
            <MoreLink href="/tax">{t('home.openTaxView')}</MoreLink>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {demoWatchlists[0].name}
              </h2>
              <span className="text-xs text-muted-foreground">{t('home.watchlist')} ▾</span>
            </div>
            {demoWatchlists[0].items.slice(3, 6).map((q) => (
              <Link
                key={q.symbol}
                href={`/stock/${q.symbol}`}
                className="flex items-center justify-between border-t border-border px-5 py-[11px] tabular-nums hover:bg-accent"
              >
                <span className="text-sm font-semibold text-foreground">{q.symbol}</span>
                <span className="flex items-center gap-3">
                  <Sparkline points={q.spark} up={q.changePct >= 0} width={52} height={20} />
                  <span dir="ltr" className="min-w-[60px] text-end text-sm text-foreground">
                    {fmtNum(q.price, nl)}
                  </span>
                  <span
                    dir="ltr"
                    className={cn('min-w-[52px] text-end text-xs', q.changePct >= 0 ? 'text-gain' : 'text-loss')}
                  >
                    {fmtPct(q.changePct, nl)}
                  </span>
                </span>
              </Link>
            ))}
            <div className="flex justify-end border-t border-border bg-well px-5 py-[11px]">
              <MoreLink href="/watchlists">{t('home.editList')}</MoreLink>
            </div>
          </section>

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
