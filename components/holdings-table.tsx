'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { MAX_OVERLAYS } from '@/components/performance-chart';
import { MoreLink } from '@/components/more-link';
import { SessionSparkline } from '@/components/charts';
import { StaleBadge } from '@/components/stale-badge';
import { useCharts, useQuotes } from '@/components/use-market-data';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtCompact, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface HoldingRow {
  symbol: string;
  name?: string;
  shares: number;
  avgCost: number;
  price: number;
  marketValue: number;
  dayChangePct?: number;
  totalGain: number;
  totalGainPct: number;
  taxIfSold: number;
}

const COLS = 'grid-cols-[1.1fr_76px_0.8fr_0.7fr_0.9fr_0.6fr_1fr_0.9fr_0.9fr_0.8fr]';
const COLS_OVERLAY = 'grid-cols-[26px_1.1fr_76px_0.8fr_0.7fr_0.9fr_0.6fr_1fr_0.9fr_0.9fr_0.8fr]';

export interface OverlayControl {
  /** Symbols whose chart overlay is toggled off. */
  hidden: Set<string>;
  onToggle: (symbol: string) => void;
  /** The thick accumulated portfolio line. */
  portfolioVisible: boolean;
  onTogglePortfolio: () => void;
}

/** Dense desktop holdings table (design 3a) — demo rows unless real ones are passed. */
export function HoldingsTable({
  marketId,
  rows,
  taxRatePct = 25,
  overlay,
}: {
  marketId: string;
  rows?: HoldingRow[];
  taxRatePct?: number;
  /** When set, rows get chart-overlay checkboxes in series colors. */
  overlay?: OverlayControl;
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
      dayChangePct: h.dayChangePct,
      totalGain: h.totalGain,
      totalGainPct: h.totalGainPct,
      taxIfSold: h.taxIfSold,
    }));

  // Live quotes (price/change/volume) + 1D sparks for every row.
  const symbols = displayRows.map((r) => r.symbol);
  const { quotes, stale } = useQuotes(symbols);
  const sparks = useCharts(symbols, '1d');

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 pt-[18px] pb-3.5">
        <span className="flex items-center gap-2.5">
          {overlay && (
            <button
              type="button"
              aria-label={t('holdings')}
              aria-pressed={overlay.portfolioVisible}
              onClick={overlay.onTogglePortfolio}
              className={cn(
                'flex size-4 items-center justify-center rounded-[4px]',
                overlay.portfolioVisible ? 'bg-foreground' : 'border-[1.5px] border-border',
              )}
            >
              {overlay.portfolioVisible && <Check className="size-3 text-background" aria-hidden />}
            </button>
          )}
          <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {t('holdings')}
          </h2>
          <StaleBadge show={stale} />
        </span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('sort')}</span>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
            {t('sortMarketValue')}
          </span>
        </div>
      </div>
      <div
        className={cn(
          overlay ? COLS_OVERLAY : COLS,
          'grid border-t border-border bg-well px-6 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground',
        )}
      >
        {overlay && <span aria-hidden />}
        <span>{t('symbol')}</span>
        <span aria-hidden />
        <span className="text-end">{t('price')}</span>
        <span className="text-end">{t('chg')}</span>
        <span className="text-end">{t('cost')}</span>
        <span className="text-end">{t('shares')}</span>
        <span className="text-end">{t('totalGain')}</span>
        <span className="text-end">{t('marketValue')}</span>
        <span className="text-end">{t('volAvg')}</span>
        <span className="text-end">{t('taxIfSold')}</span>
      </div>
      {displayRows.map((h, i) => (
        <Link
          key={h.symbol}
          href={`/stock/${h.symbol}`}
          className={cn(
            overlay ? COLS_OVERLAY : COLS,
            'grid items-center border-t border-border px-6 py-3.5 text-sm tabular-nums hover:bg-accent',
          )}
        >
          {overlay &&
            (i < MAX_OVERLAYS ? (
              <button
                type="button"
                aria-label={h.symbol}
                aria-pressed={!overlay.hidden.has(h.symbol)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  overlay.onToggle(h.symbol);
                }}
                className={cn(
                  'flex size-4 items-center justify-center rounded-[4px]',
                  overlay.hidden.has(h.symbol) && 'border-[1.5px] border-border',
                )}
                style={
                  overlay.hidden.has(h.symbol)
                    ? undefined
                    : { backgroundColor: `var(--series-${i + 1})` }
                }
              >
                {!overlay.hidden.has(h.symbol) && <Check className="size-3 text-white" aria-hidden />}
              </button>
            ) : (
              <span aria-hidden />
            ))}
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">{displaySymbol(h.symbol, market)}</span>
            <span className="text-xs text-muted-foreground">{h.name ?? h.symbol}</span>
          </span>
          {(() => {
            const q = quotes[h.symbol];
            const price = q?.price ?? h.price;
            const chg = q?.changePct ?? h.dayChangePct ?? 0;
            const series = sparks[h.symbol];
            return (
              <>
                <span className="flex justify-end">
                  {series && series.points.length > 1 ? (
                    <SessionSparkline
                      points={series.points}
                      previousClose={q?.previousClose ?? series.previousClose}
                      calendar={market.calendar}
                      width={64}
                      height={30}
                    />
                  ) : (
                    <span className="w-16" aria-hidden />
                  )}
                </span>
                <span dir="ltr" className="text-end text-foreground">{fmtNum(price, nl)}</span>
                <span dir="ltr" className={cn('text-end', chg >= 0 ? 'text-gain' : 'text-loss')}>
                  {fmtPct(chg, nl)}
                </span>
                <span dir="ltr" className="private text-end text-foreground">
                  {fmtNum(h.shares * h.avgCost, nl)}
                </span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(h.shares, nl, 1)}</span>
                <span className="private flex flex-col items-end gap-0.5">
                  <span dir="ltr" className={cn(h.totalGain >= 0 ? 'text-gain' : 'text-loss')}>
                    {fmtSigned(h.totalGain, nl)}
                  </span>
                  <span dir="ltr" className={cn('text-xs', h.totalGainPct >= 0 ? 'text-gain' : 'text-loss')}>
                    {fmtPct(h.totalGainPct, nl)}
                  </span>
                </span>
                <span dir="ltr" className="private text-end text-foreground">
                  {fmtNum(h.shares * h.avgCost + h.totalGain, nl)}
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <span dir="ltr" className="text-foreground">
                    {q?.volume !== undefined ? fmtCompact(q.volume, nl) : '—'}
                  </span>
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    {q?.avgVolume !== undefined ? fmtCompact(q.avgVolume, nl) : '—'}
                  </span>
                </span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(h.taxIfSold, nl)}</span>
              </>
            );
          })()}
        </Link>
      ))}
      <div className="flex items-center justify-between border-t border-border bg-well px-6 py-[13px]">
        <span className="private text-[13px] text-muted-foreground">
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
    dayChangePct?: number;
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
    dayChangePct: p.dayChangePct,
    totalGain: p.totalGain,
    totalGainPct: p.totalGainPct,
    // Unrealized estimate until the Phase 3 engine owns tax.
    taxIfSold: Math.max(0, p.totalGain) * (taxRatePct / 100),
  }));
}
