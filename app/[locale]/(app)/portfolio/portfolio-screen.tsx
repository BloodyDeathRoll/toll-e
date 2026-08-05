'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { HoldingsTable, positionRows, type HoldingRow } from '@/components/holdings-table';
import { usePortfolioPositions } from '@/components/use-portfolio';
import { cn } from '@/lib/utils';

const tabs = ['tabHoldings', 'tabBasic', 'tabDetails'] as const;

export function PortfolioScreen() {
  const t = useTranslations('portfolio');
  const th = useTranslations('home');
  const tn = useTranslations('nav');
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const [tab, setTab] = useState<(typeof tabs)[number]>('tabHoldings');
  const { state } = usePortfolioPositions(marketId);

  // Real portfolio once transactions exist; demo showcase otherwise.
  const real = state.status === 'data' ? state.data : null;
  const taxRate = real?.portfolio.taxRatePct ?? data.tax.ratePct;
  const rows: HoldingRow[] = real
    ? positionRows(real.positions, taxRate)
    : data.holdings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgCost: h.avgCost,
        price: h.price,
        marketValue: h.marketValue,
        totalGain: h.totalGain,
        totalGainPct: h.totalGainPct,
        taxIfSold: h.taxIfSold,
      }));
  const trades = (symbol: string) =>
    real ? undefined : data.holdings.find((h) => h.symbol === symbol)?.trades;
  const p = real
    ? {
        value: real.totals.marketValue,
        dayChange: real.totals.dayGain,
        dayChangePct: real.totals.dayGainPct,
      }
    : data.portfolio;
  const [first, ...rest] = rows;

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile (design: Portfolio · light mode) ---------- */}
      <div className="flex flex-col gap-3.5 p-4 md:hidden">
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
          <div className="flex items-center gap-3.5 text-muted-foreground">
            <Pencil className="size-4" aria-hidden />
            <ThemeToggle />
            <Link href="/transactions/new" aria-label={tn('addTransaction')}>
              <Plus className="size-[18px]" aria-hidden />
            </Link>
          </div>
        </div>

        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {t('totalValue')}
          </h2>
          <p dir="ltr" className="self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
            {sym}
            {fmtNum(p.value, nl)}
          </p>
          <p className={cn('text-sm tabular-nums', p.dayChange >= 0 ? 'text-gain' : 'text-loss')}>
            <span dir="ltr">
              {fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})
            </span>{' '}
            {th('today')}
          </p>
        </section>

        <div className="flex items-center gap-2">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded-full px-[13px] py-[5px] text-[13px]',
                tab === key
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              {t(key)}
            </button>
          ))}
          <span className="ms-auto text-xs text-muted-foreground">{th('sortMarketValue')}</span>
        </div>

        {/* Expanded lead position */}
        <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">{first.symbol}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                {t('openTag')}
              </span>
            </span>
            <span dir="ltr" className="text-base text-foreground tabular-nums">
              {fmtNum(first.marketValue, nl)}
            </span>
          </div>
          <div className="flex flex-col gap-[7px] text-[13px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('avgCostPerShare')}</span>
              <span dir="ltr" className="text-foreground">{fmtNum(first.avgCost, nl)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totalCost')}</span>
              <span dir="ltr" className="text-foreground">{fmtNum(first.shares * first.avgCost, nl)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totalGain')}</span>
              <span dir="ltr" className={cn(first.totalGain >= 0 ? 'text-gain' : 'text-loss')}>
                {fmtSigned(first.totalGain, nl)} ({fmtPct(first.totalGainPct, nl)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('unrealizedTax', { rate: taxRate })}</span>
              <span dir="ltr" className="text-foreground">{fmtNum(first.taxIfSold, nl)}</span>
            </div>
          </div>
          <div className="flex gap-2 text-[13px] tabular-nums">
            <span className="flex flex-1 justify-between rounded-lg border border-border px-3 py-[9px]">
              <span className="text-muted-foreground">{t('shares')}</span>
              <span dir="ltr" className="text-foreground">{fmtNum(first.shares, nl, 1)}</span>
            </span>
            <span className="flex flex-1 justify-between rounded-lg border border-border px-3 py-[9px]">
              <span className="text-muted-foreground">{t('trades')}</span>
              <span dir="ltr" className="text-foreground">{trades(first.symbol) ?? '—'}</span>
            </span>
          </div>
          <Link href="/transactions/new" className="text-[13px] font-semibold text-brand">
            {t('addATransaction')}
          </Link>
        </section>

        {/* Remaining positions */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          {rest.map((h, i) => (
            <Link
              key={h.symbol}
              href={`/stock/${h.symbol}`}
              className={cn(
                'flex items-center justify-between px-4 py-[13px] hover:bg-accent',
                i > 0 && 'border-t border-border',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-foreground">{h.symbol}</span>
                <span className="text-xs text-muted-foreground">
                  {t('sharesShort', { shares: fmtNum(h.shares, nl, 0) })}
                </span>
              </span>
              <span className="flex flex-col items-end tabular-nums">
                <span dir="ltr" className="text-[15px] text-foreground">{fmtNum(h.marketValue, nl)}</span>
                <span dir="ltr" className={cn('text-xs', h.totalGainPct >= 0 ? 'text-gain' : 'text-loss')}>
                  {fmtPct(h.totalGainPct, nl)}
                </span>
              </span>
            </Link>
          ))}
        </section>
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="hidden flex-1 flex-col gap-5 p-7 md:flex">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('totalValue')}
            </h1>
            <p dir="ltr" className="self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
              {sym}
              {fmtNum(p.value, nl)}
            </p>
            <p className={cn('text-sm tabular-nums', p.dayChange >= 0 ? 'text-gain' : 'text-loss')}>
              <span dir="ltr">
                {fmtSigned(p.dayChange, nl)} ({fmtPct(p.dayChangePct, nl)})
              </span>{' '}
              {th('today')}
            </p>
          </div>
          <Link
            href="/transactions/new"
            className="rounded-lg bg-primary px-4 py-[9px] text-[13px] font-semibold text-primary-foreground hover:opacity-90"
          >
            {tn('addTransaction')}
          </Link>
        </div>
        <HoldingsTable marketId={marketId} rows={real ? rows : undefined} taxRatePct={taxRate} />
      </div>
    </main>
  );
}
