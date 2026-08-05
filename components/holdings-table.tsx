'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { MoreLink } from '@/components/more-link';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLS = 'grid-cols-[1.6fr_0.8fr_0.9fr_0.9fr_1fr_1.1fr_1.1fr]';

/** Dense desktop holdings table (design 3a) — shared by Home and Portfolio. */
export function HoldingsTable({ marketId }: { marketId: string }) {
  const t = useTranslations('home');
  const locale = useLocale();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const name = (x: { name: string; nameHe?: string }) =>
    locale === 'he' && x.nameHe ? x.nameHe : x.name;

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
      {data.holdings.map((h) => (
        <Link
          key={h.symbol}
          href={`/stock/${h.symbol}`}
          className={cn(
            COLS,
            'grid items-center border-t border-border px-6 py-3.5 text-sm tabular-nums hover:bg-accent',
          )}
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">{h.symbol}</span>
            <span className="text-xs text-muted-foreground">{name(h)}</span>
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
            count: data.holdings.length,
            rate: data.tax.ratePct,
            amount: fmtNum(
              data.holdings.reduce((s, h) => s + h.taxIfSold, 0),
              nl,
            ),
          })}
        </span>
        <MoreLink href="/portfolio">{t('allTransactions')}</MoreLink>
      </div>
    </section>
  );
}
