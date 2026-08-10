'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { useQuotes, useSearch } from '@/components/use-market-data';
import { ensurePortfolioId, usePortfolioPositions } from '@/components/use-portfolio';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtDate, fmtNum, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

export function TxScreen() {
  const t = useTranslations('tx');
  const locale = useLocale();
  const router = useRouter();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const tax = demo[marketId].tax; // carried-loss preview goes real in Phase 3

  const params = useSearchParams();
  const editTxId = params.get('edit');
  const editPortfolioId = params.get('portfolio');
  const [symbol, setSymbol] = useState(params.get('symbol')?.toUpperCase() ?? '');
  const [symbolQuery, setSymbolQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [shares, setShares] = useState(10);
  const [price, setPrice] = useState(0);
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const results = useSearch(symbolQuery, marketId).slice(0, 6);
  const { quotes } = useQuotes(symbol ? [symbol] : []);
  const live = symbol ? quotes[symbol] : undefined;
  const { state, reload } = usePortfolioPositions(marketId);
  const position =
    state.status === 'data' ? state.data.positions.find((p) => p.symbol === symbol) : undefined;

  // Price prefill runs once per (symbol, date): today's quote for current
  // dates, the historical close for backdated ones. Manual edits and edit-mode
  // loads claim the key so nothing overwrites them.
  const today = new Date().toISOString().slice(0, 10);
  const prefillKey = `${symbol}@${tradeDate}`;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Edit mode: prefill the form from the existing transaction.
  const [editLoaded, setEditLoaded] = useState(false);
  useEffect(() => {
    if (!editTxId || !editPortfolioId || editLoaded) return;
    (async () => {
      const res = await fetch(`/api/portfolios/${editPortfolioId}/transactions`);
      if (!res.ok) return;
      const { transactions: txs } = await res.json();
      const tx = txs.find((x: { id: string }) => x.id === editTxId);
      if (!tx) return;
       
      setSymbol(tx.symbol);
      setType(tx.type === 'SELL' ? 'sell' : 'buy');
      setShares(Number(tx.shares));
      setPrice(Number(tx.pricePerShare));
      setTradeDate(tx.tradeDate);
      setPrefilledFor(`${tx.symbol}@${tx.tradeDate}`);
      setEditLoaded(true);
    })();
  }, [editTxId, editPortfolioId, editLoaded]);

  // Current-date prefill from the live quote.
  useEffect(() => {
    if (live && tradeDate >= today && prefilledFor !== prefillKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot quote prefill
      setPrice(Number(live.price.toFixed(2)));
      setPrefilledFor(prefillKey);
    }
  }, [live, tradeDate, today, prefilledFor, prefillKey]);

  // Backdated prefill from that date's historical close.
  useEffect(() => {
    if (!symbol || tradeDate >= today || prefilledFor === prefillKey) return;
    let alive = true;
    (async () => {
      const res = await fetch(
        `/api/market/close?symbol=${encodeURIComponent(symbol)}&date=${tradeDate}`,
      );
      if (!res.ok || !alive) return;
      const json = await res.json();
      if (json.close != null && alive) {
         
        setPrice(Number(json.close.toFixed(2)));
        setPrefilledFor(prefillKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol, tradeDate, today, prefilledFor, prefillKey]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const onPriceEdit = (n: number) => {
    setPrefilledFor(prefillKey);
    setPrice(n);
  };

  // Sell-time tax preview: the real FIFO engine via /tax/preview when signed
  // in; a demo average-cost estimate otherwise.
  const portfolioId = state.status === 'data' ? state.data.portfolio.id : null;
  interface Preview {
    proceeds: number;
    costBasis: number;
    gain: number;
    poolUsed: number;
    taxDelta: number;
    poolAfter: number;
    shieldAfter: number;
    ratePct: number;
  }
  const [serverPreview, setServerPreview] = useState<Preview | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale preview on input change
    setServerPreview(null);
    if (type !== 'sell' || !portfolioId || !symbol || !(shares > 0) || !(price >= 0)) return;
    let alive = true;
    const id = setTimeout(async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/tax/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, shares, pricePerShare: price, tradeDate }),
      });
      if (res.ok && alive) setServerPreview(await res.json());
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [type, portfolioId, symbol, shares, price, tradeDate]);

  const avgCost = serverPreview
    ? serverPreview.costBasis / shares
    : position?.avgCost;
  const proceeds = serverPreview?.proceeds ?? shares * price;
  const costBasis = serverPreview?.costBasis ?? (avgCost !== undefined ? shares * avgCost : undefined);
  const gain = serverPreview?.gain ?? (costBasis !== undefined ? proceeds - costBasis : undefined);
  // Only this year's earlier losses reduce what the broker withholds now; a
  // registered shield from an earlier year comes back at filing instead.
  const offset = serverPreview
    ? serverPreview.poolUsed
    : gain !== undefined && gain > 0
      ? Math.min(gain, tax.carriedLoss)
      : 0;
  const ratePct = serverPreview?.ratePct ?? tax.ratePct;
  const due = serverPreview
    ? serverPreview.taxDelta
    : gain !== undefined
      ? Math.max(0, gain - offset) * (tax.ratePct / 100)
      : undefined;
  const poolAfter = serverPreview ? serverPreview.poolAfter : tax.carriedLoss - offset;
  const shieldAfter = serverPreview?.shieldAfter ?? 0;

  const submit = async () => {
    if (!symbol || shares <= 0 || price < 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const portfolioId = editPortfolioId ?? (await ensurePortfolioId(marketId));
      const url = editTxId
        ? `/api/portfolios/${portfolioId}/transactions/${editTxId}`
        : `/api/portfolios/${portfolioId}/transactions`;
      const res = await fetch(url, {
        method: editTxId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editTxId ? {} : { symbol }),
          type: type.toUpperCase(),
          tradeDate,
          shares,
          pricePerShare: price,
        }),
      });
      if (res.status === 422) {
        const json = await res.json();
        setError(t('oversell', { available: fmtNum(json.available ?? 0, nl, 0) }));
        return;
      }
      if (!res.ok) throw new Error('failed');
      await reload();
      router.push('/');
    } catch (e) {
      if ((e as Error).message === 'unauthorized') {
        router.push('/sign-in');
        return;
      }
      setError(t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const fieldShell = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-2 px-6 py-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );

  const stepper = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    step: number,
  ) =>
    fieldShell(
      label,
      <div className="flex items-center gap-4 rounded-[20px] bg-well px-4 py-3">
        <input
          dir="ltr"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${label} +`}
            onClick={() => onChange(Number(((value || 0) + step).toFixed(4)))}
          >
            <ChevronUp className="size-4 text-foreground" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${label} -`}
            onClick={() => onChange(Math.max(0, Number(((value || 0) - step).toFixed(4))))}
          >
            <ChevronDown className="size-4 text-foreground" aria-hidden />
          </button>
        </span>
      </div>,
    );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-6">
      <div className="flex items-center gap-4 p-6">
        <button type="button" onClick={() => router.back()} aria-label={t('title')}>
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="text-base font-medium text-foreground">
          {editTxId ? t('editTitle') : t('title')}
        </h1>
      </div>

      {/* Ticker */}
      {fieldShell(
        t('ticker'),
        <div ref={pickerRef} className="relative">
          <div className="flex items-center gap-4 rounded-[20px] bg-well px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              dir="ltr"
              value={pickerOpen ? symbolQuery : symbol}
              placeholder={t('tickerPlaceholder')}
              disabled={Boolean(editTxId)}
              onFocus={() => {
                setPickerOpen(true);
                setSymbolQuery('');
              }}
              onChange={(e) => setSymbolQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {pickerOpen && results.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
              {results.map((r, i) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      setSymbol(r.symbol);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-4 py-2.5 text-start hover:bg-accent',
                      i > 0 && 'border-t border-border',
                    )}
                  >
                    <span className="text-[13px] font-semibold text-foreground">{r.symbol}</span>
                    <span className="flex-1 truncate text-xs text-muted-foreground">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
      )}

      {/* Type: full-width segmented pill */}
      {fieldShell(
        t('type'),
        <div className="flex rounded-[20px] bg-well">
          {(['buy', 'sell'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={cn(
                'flex-1 rounded-[20px] px-[18px] py-3 text-base',
                type === k ? 'bg-primary font-bold text-primary-foreground' : 'text-foreground',
              )}
            >
              {t(k)}
            </button>
          ))}
        </div>,
      )}

      {/* Date */}
      {fieldShell(
        t('date'),
        <div className="flex items-center gap-4 rounded-[20px] bg-well px-4 py-3">
          <CalendarDays className="size-4 shrink-0 text-foreground" aria-hidden />
          <input
            dir="ltr"
            type="date"
            value={tradeDate}
            max={today}
            onChange={(e) => setTradeDate(e.target.value)}
            aria-label={t('date')}
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none"
          />
        </div>,
      )}

      {stepper(t('shares'), shares, (n) => setShares(n), 1)}
      {position && (
        <p className="px-6 text-xs text-muted-foreground">
          {t('youHold', { shares: fmtNum(position.shares, nl, 0) })}
        </p>
      )}
      {stepper(t('pricePerShare'), price, onPriceEdit, 0.1)}

      {/* Total */}
      <div className="mx-6 flex items-center justify-between border-t border-border py-6">
        <span className="text-base font-medium text-foreground">{t('total')}</span>
        <span dir="ltr" className="private text-base font-bold text-foreground tabular-nums">
          {sym}
          {fmtNum((shares || 0) * (price || 0), nl)}
        </span>
      </div>

      {/* Sell-time tax preview */}
      {type === 'sell' && gain !== undefined && costBasis !== undefined && due !== undefined && (
        <section className="mx-6 flex flex-col gap-4 rounded-xl bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase text-muted-foreground">{t('taxEvent')}</h2>
            <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold text-subtle">
              {t('averageCost')}
            </span>
          </div>
          <div className="flex flex-col gap-3 text-[13px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('proceeds', { qty: fmtNum(shares, nl, 0), price: fmtNum(price, nl) })}
              </span>
              <span dir="ltr" className="text-foreground">{fmtNum(proceeds, nl)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('costBasis', { qty: fmtNum(shares, nl, 0), price: fmtNum(avgCost ?? 0, nl) })}
              </span>
              <span dir="ltr" className="text-foreground">{fmtNum(-costBasis, nl)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">{t('realizedGain')}</span>
              <span dir="ltr" className={cn(gain >= 0 ? 'text-gain' : 'text-loss')}>
                {fmtSigned(gain, nl)}
              </span>
            </div>
            {offset > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {serverPreview ? t('offsetByPool') : t('offsetByCarried', { year: tax.carriedFromYear })}
                </span>
                <span dir="ltr" className="text-foreground">{fmtNum(-offset, nl)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">{t('withheldAt', { rate: ratePct })}</span>
              <span dir="ltr" className="text-[15px] text-foreground">
                {sym}
                {fmtNum(due, nl)}
              </span>
            </div>
          </div>
          <p className="rounded-lg bg-well p-3.5 text-xs leading-relaxed text-muted-foreground">
            {t('poolNote', { amount: `${sym}${fmtNum(poolAfter, nl)}` })}
            {shieldAfter > 0 && ` ${t('shieldAtFilingNote')}`}
          </p>
        </section>
      )}

      {error && <p className="px-6 pt-3 text-[13px] text-loss">{error}</p>}

      {/* Save */}
      <div className="mt-auto flex flex-col items-center gap-1 pt-6">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !symbol || !(shares > 0)}
          aria-label={t('save')}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-6" aria-hidden />
        </button>
        <span className="text-xs text-foreground">
          {type === 'sell' && due !== undefined
            ? t('submitSell', { tax: `${sym}${fmtNum(due, nl)}` })
            : t('save')}
        </span>
        <p className="text-center text-xs text-muted-foreground">
          {fmtDate(tradeDate, locale)} · {symbol || '—'}
        </p>
      </div>
    </main>
  );
}
