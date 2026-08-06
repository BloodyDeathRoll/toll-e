'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { MoreLink } from '@/components/more-link';
import { ReserveBar } from '@/components/reserve-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTax } from '@/components/use-tax';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtDate, fmtMonth, fmtNum, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MonthRow {
  month: number;
  gains: number | null;
  losses: number | null;
  net: number;
  tax: number | null;
}

interface SaleRow {
  id: string;
  label: string;
  shares: number;
  date: string;
  amount: number;
  tax: number | null;
  lots?: Array<{ date: string; shares: number; costPerShare: number }>;
}

/** One shape for both sources: the live engine output or the demo frames. */
interface TaxView {
  isReal: boolean;
  year: number;
  years: number[];
  ratePct: number;
  due: number;
  realizedGains: number;
  realizedLosses: number;
  net: number;
  carriedApplied: number;
  carriedFromYear: number | null;
  taxable: number;
  shieldLeft: number;
  months: MonthRow[];
  sales: SaleRow[];
  filingDue: string;
  /** Cash coverage exists only in the demo — cash tracking is out of v1. */
  cash?: { held: number; short: number };
}

export function TaxScreen() {
  const t = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const { state } = useTax(marketId);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);

  const real = state.status === 'data' ? state.data : null;
  const demoTax = demo[marketId].tax;

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
        <h1 className="pt-1 text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </section>
      </main>
    );
  }

  // Signed in but no sales yet — explain instead of showing demo numbers.
  if (state.status === 'empty') {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
        <h1 className="pt-1 text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">{t('emptyTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
          <Link
            href="/transactions/new"
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            {t('emptyCta')}
          </Link>
        </section>
      </main>
    );
  }

  let view: TaxView;
  if (real) {
    const years = real.years.map((y) => y.year).sort((a, b) => b - a);
    const year = pickedYear && years.includes(pickedYear) ? pickedYear : years[0];
    const ledger = real.years.find((y) => y.year === year)!;
    view = {
      isReal: true,
      year,
      years: years.slice(0, 3),
      ratePct: ledger.ratePct,
      due: ledger.due,
      realizedGains: ledger.realizedGains,
      realizedLosses: ledger.realizedLosses,
      net: ledger.net,
      carriedApplied: ledger.shieldUsed,
      carriedFromYear: null,
      taxable: ledger.taxable,
      shieldLeft: ledger.shieldOut,
      months: ledger.months.map((m) => ({
        month: m.month,
        gains: m.gains > 0 ? m.gains : null,
        losses: m.losses > 0 ? -m.losses : null,
        net: m.net,
        tax: m.tax,
      })),
      sales: ledger.sales.map((s) => ({
        id: s.saleTxId,
        label: displaySymbol(s.symbol, market),
        shares: s.shares,
        date: s.date,
        amount: s.gain,
        tax: s.gain > 0 ? (s.gain * ledger.ratePct) / 100 : null,
        lots: s.matchedLots,
      })),
      filingDue: `${year + 1}-04-30`,
    };
  } else {
    view = {
      isReal: false,
      year: demoTax.year,
      years: [demoTax.year, demoTax.year - 1],
      ratePct: demoTax.ratePct,
      due: demoTax.due,
      realizedGains: demoTax.realizedGains,
      realizedLosses: demoTax.realizedLosses,
      net: demoTax.realizedGains - demoTax.realizedLosses,
      carriedApplied: demoTax.carriedLoss,
      carriedFromYear: demoTax.carriedFromYear,
      taxable: demoTax.taxable,
      shieldLeft: 0,
      months: demoTax.months,
      sales: demoTax.sales.map((s, i) => ({
        id: `demo-${i}`,
        label: locale === 'he' && s.nameHe ? s.nameHe : s.symbol,
        shares: s.shares,
        date: s.date,
        amount: s.amount,
        tax: s.tax,
      })),
      filingDue: demoTax.filingDue,
      cash: { held: demoTax.heldInCash, short: demoTax.short },
    };
  }

  // 0% ⇒ tax UI hidden for this portfolio (§3.1).
  if (view.isReal && view.ratePct === 0) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3.5 p-4 md:py-7">
        <h1 className="pt-1 text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t('disabled')}
        </section>
      </main>
    );
  }

  const carriedLabel =
    view.carriedFromYear !== null
      ? t('lossCarriedFrom', { year: view.carriedFromYear })
      : t('carriedIn');

  const yearToggle = (
    <div className="flex gap-0.5 rounded-lg border border-border bg-card p-[3px]" dir="ltr">
      {view.years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => setPickedYear(y)}
          disabled={!view.isReal}
          className={cn(
            'rounded-md px-3 py-[5px] text-xs tabular-nums',
            y === view.year
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );

  const howCalculated = (
    <div className="flex flex-col gap-[7px] text-sm tabular-nums">
      <Row label={t('realizedGains')} value={fmtNum(view.realizedGains, nl)} />
      <Row label={t('realizedLosses')} value={fmtNum(-view.realizedLosses, nl)} />
      {view.carriedApplied > 0 && <Row label={carriedLabel} value={fmtNum(-view.carriedApplied, nl)} />}
      <div className="h-px bg-border" />
      <Row label={t('taxable')} value={fmtNum(view.taxable, nl)} bold />
      <Row label={t('rate')} value={`${view.ratePct}%`} />
      <Row label={t('due')} value={fmtNum(view.due, nl)} bold big />
    </div>
  );

  const salesList = (
    <>
      {view.sales.slice(0, 4).map((s) => (
        <div key={s.id} className="border-t border-border">
          <button
            type="button"
            onClick={() => s.lots && setOpenSale(openSale === s.id ? null : s.id)}
            className={cn('flex w-full items-center justify-between px-5 py-[13px] text-start', s.lots && 'hover:bg-accent')}
          >
            <span className="flex flex-col gap-[3px]">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {t('saleShares', { symbol: s.label, shares: fmtNum(s.shares, nl, 0) })}
                {s.lots && (
                  <ChevronDown
                    className={cn('size-3 text-faint transition-transform', openSale === s.id && 'rotate-180')}
                    aria-hidden
                  />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(s.amount >= 0 ? 'saleGain' : 'saleLoss', { date: fmtDate(s.date, locale) })}
              </span>
            </span>
            <span className="private flex flex-col items-end gap-[3px] tabular-nums">
              <span dir="ltr" className={cn('text-sm', s.amount >= 0 ? 'text-gain' : 'text-loss')}>
                {fmtSigned(s.amount, nl)}
              </span>
              <span className="text-xs text-muted-foreground">
                {s.tax === null ? t('shielded') : t('taxAmount', { amount: fmtNum(s.tax, nl) })}
              </span>
            </span>
          </button>
          {/* Per-sale drill-down: the FIFO lots this sale consumed. */}
          {openSale === s.id && s.lots && (
            <div className="flex flex-col gap-1.5 bg-well px-5 py-3">
              {s.lots.map((l, i) => (
                <div key={i} className="flex justify-between text-xs tabular-nums">
                  <span className="text-muted-foreground">{fmtDate(l.date, locale)}</span>
                  <span dir="ltr" className="text-foreground">
                    {fmtNum(l.shares, nl, 0)} × {fmtNum(l.costPerShare, nl)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile (design 2a: reserve first) ---------- */}
      <div className="flex flex-col gap-3.5 p-4 md:hidden">
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
          {yearToggle}
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 pt-5 pb-4">
          <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {t('setAsideNow')}
          </h2>
          <p dir="ltr" className="private self-start text-[44px] font-semibold tracking-tighter text-foreground tabular-nums">
            {sym}
            {fmtNum(view.due, nl)}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('setAsideNote', { year: view.year })}
          </p>
          {view.cash && (
            <>
              <ReserveBar held={view.cash.held} due={view.due} />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{t('heldInCash', { amount: `${sym}${fmtNum(view.cash.held, nl)}` })}</span>
                <span>{t('short', { amount: `${sym}${fmtNum(view.cash.short, nl)}` })}</span>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-4 py-3.5">
          <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
            {t('howCalculated')}
          </h2>
          {howCalculated}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('byMonth')}
            </h2>
            <span className="text-xs text-faint">{t('netTax')}</span>
          </div>
          {view.months.map((m) => (
            <div
              key={m.month}
              className="flex items-center justify-between border-t border-border px-4 py-2.5 tabular-nums"
            >
              <span className="text-sm text-foreground">{fmtMonth(m.month, locale, 'short')}</span>
              <span className="private flex gap-4">
                <span dir="ltr" className={cn('text-sm', m.net >= 0 ? 'text-gain' : 'text-loss')}>
                  {fmtSigned(m.net, nl)}
                </span>
                <span
                  className={cn(
                    'min-w-[76px] text-end text-sm',
                    m.tax === null ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {m.tax === null ? t('shielded') : <span dir="ltr">{fmtNum(m.tax, nl)}</span>}
                </span>
              </span>
            </div>
          ))}
          <div className="flex justify-end border-t border-border bg-well px-4 py-2.5">
            <MoreLink href="/tax">{t('exportYearReport', { year: view.year })}</MoreLink>
          </div>
        </section>
      </div>

      {/* ---------- Desktop (design 3c) ---------- */}
      <div className="hidden flex-1 flex-col md:flex">
        <div className="flex items-center justify-between px-7 pt-[22px]">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('taxYear', { year: view.year, rate: view.ratePct })}
            </span>
            <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
              {t('whatYouOwe')}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            {yearToggle}
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
            >
              {t('exportReport')}
            </button>
          </div>
        </div>

        <div className="flex flex-1 gap-5 p-7 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <div className="flex gap-5">
              <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('setAsideNow')}
                </h2>
                <p dir="ltr" className="private self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(view.due, nl)}
                </p>
                {view.cash ? (
                  <>
                    <ReserveBar held={view.cash.held} due={view.due} />
                    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>{t('heldInCash', { amount: fmtNum(view.cash.held, nl) })}</span>
                      <span>{t('short', { amount: fmtNum(view.cash.short, nl) })}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {t('setAsideNote', { year: view.year })}
                  </p>
                )}
              </section>
              <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('netRealized')}
                </h2>
                <p dir="ltr" className="private self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {fmtSigned(view.net, nl, 0)}
                </p>
                <p className="private text-[13px] text-muted-foreground tabular-nums">
                  {t('gainsMinusLosses', {
                    gains: fmtNum(view.realizedGains, nl),
                    losses: fmtNum(view.realizedLosses, nl),
                  })}
                </p>
              </section>
              <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('lossShieldLeft')}
                </h2>
                <p dir="ltr" className="private self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(view.shieldLeft, nl, 0)}
                </p>
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {view.carriedApplied > 0
                    ? t('usedNote', { amount: fmtNum(view.carriedApplied, nl) })
                    : t('noShieldNote')}
                </p>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between px-6 pt-[18px] pb-3.5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('monthByMonth')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t('filingDue', { date: fmtDate(view.filingDue, locale) })}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-6 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground">
                <span>{t('month')}</span>
                <span className="text-end">{t('gains')}</span>
                <span className="text-end">{t('losses')}</span>
                <span className="text-end">{t('net')}</span>
                <span className="text-end">{t('taxAtRate', { rate: view.ratePct })}</span>
              </div>
              {view.months.map((m) => (
                <div
                  key={m.month}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border px-6 py-[13px] text-sm tabular-nums"
                >
                  <span className="text-foreground">{fmtMonth(m.month, locale)}</span>
                  <span dir="ltr" className={cn('private text-end', m.gains === null ? 'text-faint' : 'text-gain')}>
                    {m.gains === null ? '—' : fmtSigned(m.gains, nl)}
                  </span>
                  <span dir="ltr" className={cn('private text-end', m.losses === null ? 'text-faint' : 'text-loss')}>
                    {m.losses === null ? '—' : fmtSigned(m.losses, nl)}
                  </span>
                  <span dir="ltr" className="private text-end text-foreground">{fmtNum(m.net, nl)}</span>
                  <span
                    className={cn('private text-end', m.tax === null ? 'text-muted-foreground' : 'text-foreground')}
                  >
                    {m.tax === null ? t('shielded') : <span dir="ltr">{fmtNum(m.tax, nl)}</span>}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-6 py-3.5 text-sm font-semibold tabular-nums">
                <span className="text-foreground">{t('yearToDate')}</span>
                <span dir="ltr" className="private text-end text-gain">{fmtSigned(view.realizedGains, nl)}</span>
                <span dir="ltr" className="private text-end text-loss">{fmtSigned(-view.realizedLosses, nl)}</span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(view.net, nl)}</span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(view.due, nl)}</span>
              </div>
            </section>
          </div>

          {/* Right rail */}
          <div className="flex w-[330px] shrink-0 flex-col gap-5">
            <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('howCalculated')}
              </h2>
              {howCalculated}
            </section>

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <h2 className="px-5 pt-[18px] pb-3 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('recentSales')}
              </h2>
              {salesList}
              <div className="flex justify-end border-t border-border bg-well px-5 py-3">
                <MoreLink href="/transactions">{t('allSales')}</MoreLink>
              </div>
            </section>

            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('lossShield')}
              </h2>
              <p className="private text-sm leading-relaxed text-foreground">
                {view.carriedApplied > 0
                  ? t('shieldNoteApplied', {
                      amount: `${sym}${fmtNum(view.carriedApplied, nl, 0)}`,
                      taxYear: view.year,
                      saved: `${sym}${fmtNum((view.carriedApplied * view.ratePct) / 100, nl, 0)}`,
                    })
                  : t('shieldNoteNone', { amount: `${sym}${fmtNum(view.shieldLeft, nl, 0)}` })}
              </p>
              <MoreLink href="/tax">{t('howCarriedLossesWork')}</MoreLink>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  bold,
  big,
}: {
  label: string;
  value: string;
  bold?: boolean;
  big?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={cn(bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span dir="ltr" className={cn('private text-foreground', bold && 'font-semibold', big && 'text-base')}>
        {value}
      </span>
    </div>
  );
}
