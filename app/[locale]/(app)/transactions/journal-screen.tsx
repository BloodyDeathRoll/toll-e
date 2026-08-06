'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { Skeleton } from '@/components/ui/skeleton';
import { getMarket } from '@/src/markets/registry';
import { fmtDate, fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

interface TxRow {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  tradeDate: string;
  shares: string;
  pricePerShare: string;
}

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'empty' }
  | { status: 'data'; portfolioId: string; txs: TxRow[] };

export function JournalScreen() {
  const t = useTranslations('journal');
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pRes = await fetch('/api/portfolios');
      if (pRes.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      const { portfolios } = await pRes.json();
      const portfolio = portfolios.find((p: { market: string }) => p.market === marketId);
      if (!portfolio) {
        setState({ status: 'empty' });
        return;
      }
      const tRes = await fetch(`/api/portfolios/${portfolio.id}/transactions`);
      const { transactions } = await tRes.json();
      if (transactions.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({
        status: 'data',
        portfolioId: portfolio.id,
        txs: [...transactions].reverse(), // newest first
      });
    } catch {
      setState((s) => (s.status === 'loading' ? { status: 'empty' } : s));
    }
  }, [marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on market switch
    setState({ status: 'loading' });
    load();
  }, [load]);

  const remove = async (txId: string) => {
    if (state.status !== 'data') return;
    setError(null);
    const res = await fetch(`/api/portfolios/${state.portfolioId}/transactions/${txId}`, {
      method: 'DELETE',
    });
    if (res.status === 422) {
      setError(t('deleteBlocked'));
      return;
    }
    load();
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => router.back()} aria-label={t('title')} className="md:hidden">
          <ArrowLeft className="size-[18px] text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      </div>

      {error && <p className="text-[13px] text-loss">{error}</p>}

      {state.status === 'loading' && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </section>
      )}

      {state.status === 'signed-out' && (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('signIn')}</p>
          <Link
            href="/sign-in"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {t('signInCta')}
          </Link>
        </section>
      )}

      {state.status === 'empty' && (
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
          <Link
            href="/transactions/new"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {t('addFirst')}
          </Link>
        </section>
      )}

      {state.status === 'data' && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          {state.txs.map((tx, i) => {
            const shares = Number(tx.shares);
            const price = Number(tx.pricePerShare);
            return (
              <div
                key={tx.id}
                className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}
              >
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    tx.type === 'BUY' ? 'bg-gain/15 text-gain' : 'bg-primary/15 text-brand',
                  )}
                >
                  {t(tx.type === 'BUY' ? 'buy' : 'sell')}
                </span>
                <Link
                  href={`/transactions/new?edit=${tx.id}&portfolio=${state.portfolioId}`}
                  className="flex flex-1 flex-col gap-0.5"
                >
                  <span className="text-[15px] font-semibold text-foreground">{tx.symbol}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(tx.tradeDate, locale)}</span>
                </Link>
                <span className="private flex flex-col items-end gap-0.5 tabular-nums">
                  <span dir="ltr" className="text-[15px] text-foreground">
                    {market.currencySymbol}
                    {fmtNum(shares * price, nl)}
                  </span>
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    {fmtNum(shares, nl, 0)} × {fmtNum(price, nl)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(tx.id)}
                  aria-label={t('delete')}
                  className="text-faint transition-colors hover:text-loss"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
