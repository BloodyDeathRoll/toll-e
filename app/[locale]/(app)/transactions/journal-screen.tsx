'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
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

const sortKeys = ['date', 'name', 'amount', 'action'] as const;
type SortKey = (typeof sortKeys)[number];

const sorters: Record<SortKey, (a: TxRow, b: TxRow) => number> = {
  date: (a, b) => b.tradeDate.localeCompare(a.tradeDate),
  name: (a, b) => a.symbol.localeCompare(b.symbol) || b.tradeDate.localeCompare(a.tradeDate),
  amount: (a, b) =>
    Number(b.shares) * Number(b.pricePerShare) - Number(a.shares) * Number(a.pricePerShare),
  action: (a, b) => a.type.localeCompare(b.type) || b.tradeDate.localeCompare(a.tradeDate),
};

/**
 * The Transactions tab: every buy and sell, newest first. It is a pane now
 * rather than a page — the screen's header, its summary card and the tab strip
 * above it belong to transactions-screen.tsx, which shows this beside the P&L.
 */
export function JournalPane({ year }: { year?: number | null } = {}) {
  const t = useTranslations('journal');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('date');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Only the newest load may write state: the lens hydrates a beat after
  // mount, so a request for the previous market is often still in flight.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const apply = (next: State) => {
      if (gen.current === mine) setState(next);
    };
    try {
      const pRes = await fetch('/api/portfolios');
      if (pRes.status === 401) {
        apply({ status: 'signed-out' });
        return;
      }
      const { portfolios } = await pRes.json();
      const portfolio = portfolios.find((p: { market: string }) => p.market === marketId);
      if (!portfolio) {
        apply({ status: 'empty' });
        return;
      }
      const tRes = await fetch(`/api/portfolios/${portfolio.id}/transactions`);
      const { transactions } = await tRes.json();
      if (transactions.length === 0) {
        apply({ status: 'empty' });
        return;
      }
      apply({ status: 'data', portfolioId: portfolio.id, txs: transactions });
    } catch {
      if (gen.current === mine) {
        setState((s) => (s.status === 'loading' ? { status: 'empty' } : s));
      }
    }
  }, [marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on market switch
    setState({ status: 'loading' });
    load();
  }, [load]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

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

  // The parent's year picker scopes this list too; null = all years (the
  // pane is also used standalone, where no picker exists).
  const inYear =
    state.status === 'data'
      ? state.txs.filter((tx) => year == null || tx.tradeDate.startsWith(String(year)))
      : [];
  const sorted = [...inYear].sort(sorters[sort]);

  // Month captions only make sense while the list is in date order; under any
  // other sort the dates jump around and the caption would lie about its rows.
  const monthOf = (iso: string) => iso.slice(0, 7);
  const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(`${iso}T00:00:00`),
    );

  return (
    <div className="flex flex-col pt-4">
      {/* Sort by */}
      {state.status === 'data' && (
        <div className="flex items-center justify-end gap-2 px-6 pb-2">
          <span className="text-sm text-muted-foreground">{t('sortBy')}</span>
          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              aria-expanded={sortOpen}
              className="flex items-center gap-1 rounded-full bg-well px-3 py-2 text-sm font-medium text-foreground"
            >
              {t(`sort.${sort}`)}
              <ChevronDown className="size-4" aria-hidden />
            </button>
            {sortOpen && (
              <div className="absolute end-0 top-full z-50 mt-1.5 flex w-40 flex-col gap-4 rounded-[20px] bg-well p-6 shadow-lg">
                {sortKeys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSort(k);
                      setSortOpen(false);
                    }}
                    className="flex items-center justify-between text-base text-foreground"
                  >
                    {t(`sort.${k}`)}
                    {k === sort && <Check className="size-4" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="px-6 pb-2 text-[13px] text-loss">{error}</p>}

      {state.status === 'loading' && (
        <section className="flex flex-col gap-3 px-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </section>
      )}

      {state.status === 'signed-out' && (
        <section className="mx-6 flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
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
        <section className="mx-6 flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
          <Link
            href="/transactions/new"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {t('addFirst')}
          </Link>
        </section>
      )}

      {state.status === 'data' && sorted.length === 0 && year != null && (
        <p className="px-6 py-6 text-sm text-muted-foreground">{t('noneInYear', { year })}</p>
      )}

      {state.status === 'data' && (
        <section className="flex flex-col px-6">
          {sorted.map((tx, i) => {
            const shares = Number(tx.shares);
            const price = Number(tx.pricePerShare);
            const newMonth =
              sort === 'date' &&
              (i === 0 || monthOf(sorted[i - 1].tradeDate) !== monthOf(tx.tradeDate));
            return (
              <Fragment key={tx.id}>
                {newMonth && (
                  <h2 className="border-t border-border pt-4 pb-1.5 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground first:border-t-0 first:pt-0">
                    {monthLabel(tx.tradeDate)}
                  </h2>
                )}
                <div className="flex items-center gap-4 border-b border-border py-[18px]">
                  <span
                    className={cn(
                      'w-16 rounded-full py-1 text-center text-sm font-semibold',
                      tx.type === 'BUY' ? 'bg-gain/10 text-gain' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {t(tx.type === 'BUY' ? 'buy' : 'sell')}
                  </span>
                  <Link
                    href={`/transactions/new?edit=${tx.id}&portfolio=${state.portfolioId}`}
                    className="flex flex-1 flex-col"
                  >
                    <span className="text-base font-bold text-foreground">{tx.symbol}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(tx.tradeDate, locale)}</span>
                  </Link>
                  <span className="private flex flex-col items-end tabular-nums">
                    <span dir="ltr" className="text-base font-bold text-foreground">
                      {market.currencySymbol}
                      {fmtNum(shares * price, nl)}
                    </span>
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      {fmtNum(shares, nl, 0)} X {fmtNum(price, nl)}
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
              </Fragment>
            );
          })}
        </section>
      )}
    </div>
  );
}
