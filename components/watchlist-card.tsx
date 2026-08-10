'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { MoreLink } from '@/components/more-link';
import { Sparkline, sparkFromCloses } from '@/components/charts';
import { useChart, useQuotes } from '@/components/use-market-data';
import { useWatchlists } from '@/components/use-watchlists';
import { demoWatchlists } from '@/src/demo/data';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { fmtNum, fmtPct } from '@/lib/format';
import type { Quote } from '@/src/market-data/types';
import { cn } from '@/lib/utils';

/** Desktop-rail watchlist (design 3a): user's first list live, demo otherwise. */
export function WatchlistCard({ marketId }: { marketId: string }) {
  const t = useTranslations('home');
  const market = getMarket(marketId);
  const { state } = useWatchlists();

  const realList =
    state.status === 'data'
      ? (state.lists.find((l) => l.symbols.length > 0) ?? state.lists[0])
      : undefined;
  const symbols = realList?.symbols.slice(0, 5) ?? [];
  const { quotes } = useQuotes(symbols, 60_000);

  // Signed in with no lists yet: prompt instead of confusing demo data.
  const noLists = state.status === 'data' && !realList;
  const title = realList?.name ?? (noLists ? t('watchlist') : demoWatchlists[0].name);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{t('watchlist')} ▾</span>
      </div>
      {noLists && (
        <p className="border-t border-border px-5 py-4 text-[13px] text-muted-foreground">
          {t('watchlistNone')}
        </p>
      )}
      {realList
        ? symbols.map((s) => (
            <LiveRow key={s} symbol={s} quote={quotes[s]} numberLocale={market.numberLocale} marketId={marketId} />
          ))
        : !noLists && demoWatchlists[0].items.slice(3, 6).map((q) => (
            <Link
              key={q.symbol}
              href={`/stock/${q.symbol}`}
              className="flex items-center justify-between border-t border-border px-5 py-[11px] tabular-nums hover:bg-accent"
            >
              <span className="text-sm font-semibold text-foreground">{q.symbol}</span>
              <span className="flex items-center gap-3">
                <Sparkline points={q.spark} up={q.changePct >= 0} width={52} height={20} />
                <span dir="ltr" className="min-w-[60px] text-end text-sm text-foreground">
                  {fmtNum(q.price, market.numberLocale)}
                </span>
                <span
                  dir="ltr"
                  className={cn('min-w-[52px] text-end text-xs', q.changePct >= 0 ? 'text-gain' : 'text-loss')}
                >
                  {fmtPct(q.changePct, market.numberLocale)}
                </span>
              </span>
            </Link>
          ))}
      {realList && symbols.length === 0 && (
        <p className="border-t border-border px-5 py-4 text-[13px] text-muted-foreground">
          {t('watchlistEmpty')}
        </p>
      )}
      <div className="flex justify-end border-t border-border bg-well px-5 py-[11px]">
        <MoreLink href="/watchlists">{noLists ? t('watchlistCreate') : t('editList')}</MoreLink>
      </div>
    </section>
  );
}

function LiveRow({
  symbol,
  quote,
  numberLocale,
  marketId,
}: {
  symbol: string;
  quote?: Quote;
  numberLocale: string;
  marketId: string;
}) {
  const { data: series } = useChart(symbol, '5d');
  const spark = series ? sparkFromCloses(series.points.map((p) => p.close).slice(-40)) : [];
  const up = (quote?.changePct ?? 0) >= 0;

  return (
    <Link
      href={`/stock/${symbol}`}
      className="flex items-center justify-between border-t border-border px-5 py-[11px] tabular-nums hover:bg-accent"
    >
      <span className="text-sm font-semibold text-foreground">
        {displaySymbol(symbol, getMarket(marketId))}
      </span>
      <span className="flex items-center gap-3">
        {spark.length > 1 ? (
          <Sparkline points={spark} up={up} width={52} height={20} />
        ) : (
          <span className="w-[52px]" aria-hidden />
        )}
        <span dir="ltr" className="min-w-[60px] text-end text-sm text-foreground">
          {quote ? fmtNum(quote.price, numberLocale) : '—'}
        </span>
        <span
          dir="ltr"
          className={cn('min-w-[52px] text-end text-xs', up ? 'text-gain' : 'text-loss')}
        >
          {quote ? fmtPct(quote.changePct, numberLocale) : ''}
        </span>
      </span>
    </Link>
  );
}
