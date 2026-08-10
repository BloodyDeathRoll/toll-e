'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MarketMenu } from '@/components/app-shell/market-menu';
import { SessionStatus } from '@/components/session-indicator';
import { StaleBadge } from '@/components/stale-badge';
import { Sparkline } from '@/components/charts';
import { useFx, useIndexQuotes, useQuotes } from '@/components/use-market-data';
import { getMarket } from '@/src/markets/registry';
import { demo, demoFx } from '@/src/demo/data';
import { fmtNum, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

const quoteTabs = ['mostActive', 'gainers', 'losers'] as const;

export function MarketsScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const [tab, setTab] = useState<(typeof quoteTabs)[number]>('mostActive');
  const { quotes: indexQuotes, stale: indexesStale } = useIndexQuotes(marketId);
  const { data: fx } = useFx('USDILS');
  const name = (x: { name: string; nameHe?: string }) =>
    locale === 'he' && x.nameHe ? x.nameHe : x.name;

  // Live quotes over the static mover universe — demo numbers only as a
  // fallback so a Yahoo outage degrades instead of blanking the list.
  const { quotes: liveQuotes, stale: quotesStale } = useQuotes(
    data.mostActive.map((q) => q.symbol),
  );
  const mostActive = data.mostActive.map((q) => {
    const live = liveQuotes[q.symbol];
    return { ...q, price: live?.price ?? q.price, changePct: live?.changePct ?? q.changePct };
  });
  const quotes = {
    mostActive,
    gainers: [...mostActive].filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct),
    losers: [...mostActive].filter((q) => q.changePct < 0).sort((a, b) => a.changePct - b.changePct),
  }[tab];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
      <div className="flex items-center justify-between pt-1 md:hidden">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">{t('nav.markets')}</h1>
        <MarketMenu />
      </div>

      {/* Leading indexes */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
          <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {t('markets.leadingIndexes')}
          </h2>
          <StaleBadge show={indexesStale} />
        </div>
        {data.indexes.map((ix) => {
          const live = indexQuotes[ix.symbol];
          const value = live?.price ?? ix.value;
          const pct = live?.changePct ?? ix.changePct;
          return (
            <div key={ix.symbol} className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-foreground">{name(ix)}</span>
                <span className="text-xs text-muted-foreground">
                  {locale === 'he' && ix.longNameHe ? ix.longNameHe : (ix.longName ?? ix.name)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="flex flex-col items-end gap-0.5 tabular-nums">
                  <span dir="ltr" className="text-[15px] text-foreground">{fmtNum(value, nl)}</span>
                  <span dir="ltr" className={cn('text-xs', pct >= 0 ? 'text-gain' : 'text-loss')}>
                    {fmtPct(pct, nl)}
                  </span>
                </span>
                {ix.spark && <Sparkline points={ix.spark} up={pct >= 0} />}
              </span>
            </div>
          );
        })}
      </section>

      {/* Most active / gainers / losers */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex gap-[18px] px-4 pt-3 pb-2.5">
          {quoteTabs.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'pb-1 text-[13px]',
                tab === key
                  ? 'border-b-2 border-brand font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {t(`markets.${key}`)}
            </button>
          ))}
          <StaleBadge show={quotesStale} />
        </div>
        {quotes.map((q) => (
          <Link
            key={q.symbol}
            href={`/stock/${q.symbol}`}
            className="flex items-center justify-between border-t border-border px-4 py-[11px] hover:bg-accent"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-foreground">{name(q)}</span>
              <span className="text-xs text-muted-foreground">{q.symbol}</span>
            </span>
            <span className="flex flex-col items-end gap-0.5 tabular-nums">
              <span dir="ltr" className="text-[15px] text-foreground">
                {market.currencySymbol}
                {fmtNum(q.price, nl)}
              </span>
              <span dir="ltr" className={cn('text-xs', q.changePct >= 0 ? 'text-gain' : 'text-loss')}>
                {fmtPct(q.changePct, nl)}
              </span>
            </span>
          </Link>
        ))}
      </section>

      {/* FX + session status */}
      <section className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
        <span className="text-[13px] text-subtle">
          {t('markets.fx', { rate: fmtNum(fx?.rate ?? demoFx.rate, nl, 3) })}
        </span>
        <SessionStatus marketId={marketId} className="text-[13px]" />
      </section>
    </main>
  );
}
