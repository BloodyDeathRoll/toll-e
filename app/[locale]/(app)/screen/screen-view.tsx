'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { RowLink } from '@/components/row-link';
import { ChangePill } from '@/components/quote-bits';
import { Skeleton } from '@/components/ui/skeleton';
import { useScreen } from '@/components/use-market-data';
import { displaySymbol, getMarket, marketForSymbol } from '@/src/markets/registry';
import type { ScreenKind } from '@/src/market-data/types';
import { fmtCompact, fmtNum } from '@/lib/format';

/**
 * A classification's leading names, largest first — a search-results page for
 * "who else does this". The active market decides which exchange answers, so
 * the same industry tag reads Wall Street or Tel Aviv depending on the lens.
 */
export function ScreenView({ kind, name }: { kind: ScreenKind; name: string }) {
  const t = useTranslations('screen');
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const { data, stale } = useScreen(kind, name, marketId);

  const quotes = data?.quotes ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center gap-4 p-6 pb-4">
        <button type="button" onClick={() => router.back()} aria-label={t(kind)}>
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <span className="flex min-w-0 flex-col">
          <span className="text-xs uppercase text-muted-foreground">{t(kind)}</span>
          <h1 className="truncate text-xl font-bold text-foreground">{name}</h1>
        </span>
      </div>

      <div className="flex items-baseline justify-between px-6 pb-2">
        <span className="text-xs uppercase text-muted-foreground">{t('leading')}</span>
        {data && data.total > 0 && (
          <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
            {t('countOf', { shown: quotes.length, total: data.total })}
          </span>
        )}
      </div>

      <section className="px-6 pb-6">
        {!data && !stale && (
          <div className="flex flex-col gap-4 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {stale && !data && <p className="py-6 text-sm text-muted-foreground">{t('failed')}</p>}
        {data && quotes.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {quotes.map((q) => {
          const sm = marketForSymbol(q.symbol);
          return (
            <RowLink
              key={q.symbol}
              href={`/stock/${q.symbol}`}
              className="flex items-center justify-between gap-4 border-b border-border py-2.5"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[18px] font-bold text-foreground">
                  {displaySymbol(q.symbol, sm)}
                </span>
                <span className="truncate text-xs text-foreground">{q.name}</span>
                {q.marketCap !== undefined && (
                  <span dir="ltr" className="text-xs text-muted-foreground tabular-nums">
                    {sm.currencySymbol}
                    {fmtCompact(q.marketCap, nl)}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span dir="ltr" className="text-[16px] font-bold text-foreground tabular-nums">
                  {sm.currencySymbol}
                  {fmtNum(q.price, sm.numberLocale)}
                </span>
                <ChangePill pct={q.changePct} numberLocale={nl} className="text-[16px]" />
              </span>
            </RowLink>
          );
        })}
      </section>
    </main>
  );
}
