'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MarketMenu } from '@/components/app-shell/market-menu';
import { SessionStatus } from '@/components/session-indicator';
import { StaleBadge } from '@/components/stale-badge';
import { SessionSparkline, Sparkline } from '@/components/charts';
import { ChangePill, AfterHours } from '@/components/quote-bits';
import { UnderlineTabs } from '@/components/underline-tabs';
import { useCharts, useFx, useIndexQuotes, useQuotes } from '@/components/use-market-data';
import { getMarket } from '@/src/markets/registry';
import { demo, demoFx } from '@/src/demo/data';
import { fmtNum } from '@/lib/format';

const quoteTabs = ['mostActive', 'gainers', 'losers'] as const;

export function MarketsScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const data = demo[marketId];
  const nl = market.numberLocale;
  const [tab, setTab] = useState<(typeof quoteTabs)[number]>('mostActive');
  const { quotes: indexQuotes, stale: indexesStale } = useIndexQuotes(marketId);
  const { data: fx } = useFx('USDILS');
  const name = (x: { name: string; nameHe?: string }) =>
    locale === 'he' && x.nameHe ? x.nameHe : x.name;
  const compact = new Intl.NumberFormat(nl, { notation: 'compact', maximumFractionDigits: 1 });

  // Live quotes over the static mover universe — demo numbers only as a
  // fallback so a Yahoo outage degrades instead of blanking the list.
  const moverSymbols = data.mostActive.map((q) => q.symbol);
  const { quotes: liveQuotes, stale: quotesStale } = useQuotes(moverSymbols);
  const moverCharts = useCharts(moverSymbols, '1d');
  const indexCharts = useCharts(data.indexes.map((ix) => ix.symbol), '1d');
  const mostActive = data.mostActive.map((q) => {
    const live = liveQuotes[q.symbol];
    return { ...q, price: live?.price ?? q.price, changePct: live?.changePct ?? q.changePct };
  });
  const quotes = {
    mostActive,
    gainers: [...mostActive].filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct),
    losers: [...mostActive].filter((q) => q.changePct < 0).sort((a, b) => a.changePct - b.changePct),
  }[tab];

  const spark = (symbol: string, fallback: number[] | undefined, up: boolean) => {
    const series = (symbol in indexCharts ? indexCharts : moverCharts)[symbol];
    if (series && series.points.length > 1) {
      return (
        <SessionSparkline
          points={series.points}
          previousClose={(indexQuotes[symbol] ?? liveQuotes[symbol])?.previousClose ?? series.previousClose}
          calendar={market.calendar}
          width={91}
          height={36}
        />
      );
    }
    if (fallback?.length) return <Sparkline points={fallback} up={up} width={91} height={36} />;
    return <span className="w-[91px]" aria-hidden />;
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      {/* Header: back + title (design), market switch kept for US/TASE */}
      <div className="flex items-center gap-4 p-6">
        <button type="button" onClick={() => router.back()} aria-label={t('nav.back')} className="md:hidden">
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="flex-1 text-base font-medium text-foreground">{t('nav.markets')}</h1>
        <StaleBadge show={indexesStale || quotesStale} />
        <MarketMenu />
      </div>

      {/* Leading indexes */}
      <section className="flex flex-col gap-2.5 px-6 pb-6">
        <h2 className="text-xs uppercase tracking-[-0.005em] text-muted-foreground">
          {t('markets.leadingIndexes')}
        </h2>
        {data.indexes.map((ix, i) => {
          const live = indexQuotes[ix.symbol];
          const value = live?.price ?? ix.value;
          const pct = live?.changePct ?? ix.changePct;
          return (
            <div
              key={ix.symbol}
              className={
                i < data.indexes.length - 1
                  ? 'flex items-center justify-between border-b border-border pb-2.5'
                  : 'flex items-center justify-between pb-2.5'
              }
            >
              <span className="text-base font-bold text-foreground">{name(ix)}</span>
              <span className="flex items-center gap-6">
                {spark(ix.symbol, ix.spark, pct >= 0)}
                <span className="flex flex-col items-end gap-0.5">
                  <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                    {fmtNum(value, nl)}
                  </span>
                  <ChangePill pct={pct} numberLocale={nl} />
                </span>
              </span>
            </div>
          );
        })}
      </section>

      {/* Most active / gainers / losers */}
      <section className="flex flex-col gap-2.5 px-6 pb-6">
        <UnderlineTabs
          tabs={quoteTabs}
          value={tab}
          onChange={setTab}
          label={(k) => t(`markets.${k}`)}
          className="pb-2.5"
        />
        {quotes.map((q) => {
          const live = liveQuotes[q.symbol];
          return (
            <Link
              key={q.symbol}
              href={`/stock/${q.symbol}`}
              className="flex items-center justify-between border-b border-border pb-2.5"
            >
              <span className="flex min-w-0 flex-col gap-2">
                <span className="flex flex-col">
                  <span className="text-base font-bold text-foreground">{q.symbol}</span>
                  <span className="truncate text-xs text-foreground">{name(q)}</span>
                </span>
                {live?.volume !== undefined && (
                  <span className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">{t('markets.volume')}</span>
                    <span dir="ltr" className="font-bold text-foreground tabular-nums">
                      {compact.format(live.volume)}
                    </span>
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-6">
                {spark(q.symbol, undefined, q.changePct >= 0)}
                <span className="flex flex-col items-end gap-0.5">
                  <span dir="ltr" className="text-sm font-bold text-foreground tabular-nums">
                    {fmtNum(q.price, nl)}
                  </span>
                  <ChangePill pct={q.changePct} numberLocale={nl} />
                  <AfterHours quote={live} numberLocale={nl} />
                </span>
              </span>
            </Link>
          );
        })}
      </section>

      {/* FX + session status */}
      <section className="flex items-center justify-between px-6 pb-6">
        <span className="text-[13px] text-subtle">
          {t('markets.fx', { rate: fmtNum(fx?.rate ?? demoFx.rate, nl, 3) })}
        </span>
        <SessionStatus marketId={marketId} className="text-[13px]" />
      </section>
    </main>
  );
}
