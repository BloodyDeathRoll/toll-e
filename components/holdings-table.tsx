'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { MoreLink } from '@/components/more-link';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface HoldingRow {
  symbol: string;
  name?: string;
  shares: number;
  avgCost: number;
  price: number;
  marketValue: number;
  totalGain: number;
  totalGainPct: number;
  taxIfSold: number;
}

const COLS = 'grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_1.1fr_1.1fr]';

/** Dense desktop holdings table (design 3a) — demo rows unless real ones are passed. */
export function HoldingsTable({
  marketId,
  rows,
  taxRatePct = 25,
}: {
  marketId: string;
  rows?: HoldingRow[];
  taxRatePct?: number;
}) {
  const t = useTranslations('home');
  const locale = useLocale();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;

  const displayRows: HoldingRow[] =
    rows ??
    data.holdings.map((h) => ({
      symbol: h.symbol,
      name: locale === 'he' && h.nameHe ? h.nameHe : h.name,
      shares: h.shares,
      avgCost: h.avgCost,
      price: h.price,
      marketValue: h.marketValue,
      totalGain: h.totalGain,
      totalGainPct: h.totalGainPct,
      taxIfSold: h.taxIfSold,
    }));

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 pt-[18px] pb-3.5">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('holdings')}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('sort')}</span>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
            {t('sortMarketValue')}
          </span>
        </div>
      </div>
      <div
        className={cn(
          COLS,
          'grid border-t border-border bg-well px-6 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground',
        )}
      >
        <span>{t('symbol')}</span>
        <span className="text-end">{t('shares')}</span>
        <span className="text-end">{t('avgCost')}</span>
        <span className="text-end">{t('price')}</span>
        <span className="text-end">{t('marketValue')}</span>
        <span className="text-end">{t('totalGain')}</span>
        <span className="text-end">{t('taxIfSold')}</span>
      </div>
      {displayRows.map((h) => (
        <Link
          key={h.symbol}
          href={`/stock/${h.symbol}`}
          className={cn(
            COLS,
            'grid items-center border-t border-border px-6 py-3.5 text-sm tabular-nums hover:bg-accent',
          )}
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">{displaySymbol(h.symbol, market)}</span>
            <span className="text-xs text-muted-foreground">{h.name ?? h.symbol}</span>
          </span>
          <span dir="ltr" className="text-end text-foreground">{fmtNum(h.shares, nl, 1)}</span>
          <span dir="ltr" className="text-end text-foreground">{fmtNum(h.avgCost, nl)}</span>
          <span dir="ltr" className="text-end text-foreground">{fmtNum(h.price, nl)}</span>
          <span dir="ltr" className="text-end text-foreground">{fmtNum(h.marketValue, nl)}</span>
          <span dir="ltr" className={cn('text-end', h.totalGain >= 0 ? 'text-gain' : 'text-loss')}>
            {fmtSigned(h.totalGain, nl)} ({fmtPct(h.totalGainPct, nl)})
          </span>
          <span dir="ltr" className="text-end text-foreground">{fmtNum(h.taxIfSold, nl)}</span>
        </Link>
      ))}
      <div className="flex items-center justify-between border-t border-border bg-well px-6 py-[13px]">
        <span className="text-[13px] text-muted-foreground">
          {t('positionsSummary', {
            count: displayRows.length,
            rate: taxRatePct,
            amount: fmtNum(
              displayRows.reduce((s, h) => s + h.taxIfSold, 0),
              nl,
            ),
          })}
        </span>
        <MoreLink href="/transactions">{t('allTransactions')}</MoreLink>
      </div>
    </section>
  );
}

/** Map live /api/positions rows to table rows; tax at the portfolio rate. */
export function positionRows(
  positions: Array<{
    symbol: string;
    name?: string;
    shares: number;
    avgCost: number;
    marketValue: number;
    totalGain: number;
    totalGainPct: number;
  }>,
  taxRatePct: number,
): HoldingRow[] {
  return positions.map((p) => ({
    symbol: p.symbol,
    name: p.name,
    shares: p.shares,
    avgCost: p.avgCost,
    price: p.shares > 0 ? p.marketValue / p.shares : 0,
    marketValue: p.marketValue,
    totalGain: p.totalGain,
    totalGainPct: p.totalGainPct,
    // Unrealized estimate until the Phase 3 engine owns tax.
    taxIfSold: Math.max(0, p.totalGain) * (taxRatePct / 100),
  }));
}
