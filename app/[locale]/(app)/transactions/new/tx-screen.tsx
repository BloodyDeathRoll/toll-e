'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { getMarket } from '@/src/markets/registry';
import { demo, getDemoHolding, getDemoStock } from '@/src/demo/data';
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

  const symbol = useSearchParams().get('symbol') ?? demo[marketId].holdings[0].symbol;
  const stock = getDemoStock(symbol);
  const holding = getDemoHolding(marketId, symbol) ?? getDemoHolding(marketId === 'US' ? 'IL' : 'US', symbol);
  const tax = demo[marketId].tax;

  const [type, setType] = useState<'buy' | 'sell'>('sell');
  const [shares, setShares] = useState(100);
  const [price, setPrice] = useState(stock.price);

  // Average-cost preview only — the real engine does FIFO lot matching per
  // AGENTS.md; this mirrors the design's inline estimate until Phase 3.
  const avgCost = holding?.avgCost ?? stock.price;
  const proceeds = shares * price;
  const costBasis = shares * avgCost;
  const gain = proceeds - costBasis;
  const offset = gain > 0 ? Math.min(gain, tax.carriedLoss) : 0;
  const due = Math.max(0, gain - offset) * (tax.ratePct / 100);
  const carriedLeft = tax.carriedLoss - offset;
  const today = new Date().toISOString().slice(0, 10);

  const numField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-subtle">{label}</span>
      <input
        dir="ltr"
        type="number"
        inputMode="decimal"
        min={0}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="rounded-lg border border-border bg-well px-3.5 py-3 text-base text-foreground tabular-nums outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 md:py-7">
      <div className="flex items-center gap-3 pt-1 pb-4">
        <button type="button" onClick={() => router.back()} aria-label={t('title')}>
          <ArrowLeft className="size-[18px] text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      </div>

      <div className="flex flex-col gap-3.5">
        <section className="flex flex-col rounded-2xl border border-border bg-card px-4 py-1">
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-muted-foreground">{t('ticker')}</span>
            <span className="text-[15px] font-semibold text-foreground">
              {stock.symbol} · {stock.name.split(' ')[0]}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border py-3.5">
            <span className="text-sm text-muted-foreground">{t('type')}</span>
            <div className="flex gap-1 rounded-full bg-background p-[3px]">
              {(['buy', 'sell'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className={cn(
                    'rounded-full px-3.5 py-1 text-[13px]',
                    type === k
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border py-3.5">
            <span className="text-sm text-muted-foreground">{t('date')}</span>
            <span className="text-[15px] text-foreground">{fmtDate(today, locale)}</span>
          </div>
        </section>

        {numField(
          t('shares'),
          shares,
          setShares,
          holding ? t('youHold', { shares: fmtNum(holding.shares, nl, 0) }) : undefined,
        )}
        {numField(t('pricePerShare'), price, setPrice)}

        {type === 'sell' && (
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('taxEvent')}
              </h2>
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
                  {t('costBasis', { qty: fmtNum(shares, nl, 0), price: fmtNum(avgCost, nl) })}
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
                    {t('offsetByCarried', { year: tax.carriedFromYear })}
                  </span>
                  <span dir="ltr" className="text-foreground">{fmtNum(-offset, nl)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-foreground">{t('taxDueAt', { rate: tax.ratePct })}</span>
                <span dir="ltr" className="text-[15px] text-foreground">
                  {sym}
                  {fmtNum(due, nl)}
                </span>
              </div>
            </div>
            <p className="rounded-lg bg-well p-3.5 text-xs leading-relaxed text-muted-foreground">
              {t('carryNote', { amount: `${sym}${fmtNum(carriedLeft, nl)}` })}
            </p>
          </section>
        )}
      </div>

      <div className="sticky bottom-[72px] mt-auto pt-4 md:bottom-0">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {type === 'sell'
            ? t('submitSell', { tax: `${sym}${fmtNum(due, nl)}` })
            : t('submitBuy')}
        </button>
      </div>
    </main>
  );
}
