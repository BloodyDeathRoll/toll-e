'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Shield } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { AppHeader } from '@/components/app-shell/app-header';
import { UnderlineTabs } from '@/components/underline-tabs';
import { ShieldRows } from '@/components/shield-rows';
import { useMarket } from '@/components/app-shell/market-context';
import { MoreLink, MoreButton } from '@/components/more-link';
import { ReserveBar } from '@/components/reserve-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTax } from '@/components/use-tax';
import { getMarket, displaySymbol } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtDate, fmtMonth, fmtNum, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

const mobileTabs = ['monthly', 'yearly'] as const;

interface MonthRow {
  month: number;
  gains: number | null;
  losses: number | null;
  net: number;
  /** Earlier-in-the-year losses this month's gains absorbed. */
  poolUsed: number;
  /** Withheld at source at month end; null ⇒ nothing withheld. */
  paid: number | null;
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
  realizedGains: number;
  realizedLosses: number;
  net: number;
  taxable: number;
  /** Withheld at source across the year — the cash already gone. */
  paid: number;
  /** taxable × rate, before the registered shield. */
  owedBeforeShield: number;
  /** Registered shield applied at filing (money). */
  shieldApplied: number;
  /** The year's true liability. */
  owed: number;
  /** paid − owed, back from the government in the following year's filing. */
  refund: number;
  carriedFromYear: number | null;
  /** Registered shield left: money primary, underlying loss secondary. */
  shieldLeft: number;
  shieldLossLeft: number;
  /**
   * Realized losses still sitting in this year's at-source pool, waiting to
   * absorb the next gain. Intra-year only — it never crosses December, which
   * is exactly what separates it from the registered shield above.
   */
  poolLeft: number;
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
  // Flip a positive magnitude to its negative, leaving zero alone — `-0`
  // formats as "-0.00", and a year with no losses should read as a plain
  // zero. Same guard as the performance screen.
  const neg = (v: number) => (v > 0 ? -v : 0);
  const { state } = useTax(marketId);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<(typeof mobileTabs)[number]>('monthly');
  // Both start collapsed. undefined = "latest open" (armed by "Detailed view");
  // null = all collapsed.
  const [openMonth, setOpenMonthRaw] = useState<number | null | undefined>(null);
  const [openYearState, setOpenYearRaw] = useState<number | null | undefined>(null);
  const monthlyRef = useRef<HTMLElement>(null);
  // Armed by "Detailed view" on the yearly tab; the scroll has to wait for the
  // monthly section to render, and a ref keeps it out of the render cycle.
  const jumpToMonthly = useRef(false);

  useEffect(() => {
    if (mobileTab !== 'monthly' || !jumpToMonthly.current) return;
    jumpToMonthly.current = false;
    monthlyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mobileTab]);

  const real = state.status === 'data' ? state.data : null;
  const demoTax = demo[marketId].tax;
  const demoMonthlyPaid = demoTax.months.reduce((s, m) => s + (m.tax ?? 0), 0);

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

  // Yearly accordion rows (mobile): every ledger year, newest first.
  const yearRows = real
    ? [...real.years]
        .sort((a, b) => b.year - a.year)
        .map((y) => ({
          year: y.year,
          owed: y.owed,
          paid: y.paid,
          refund: y.refundNextYear,
          registered: y.registered,
          shieldOut: y.shieldOut,
          gains: y.realizedGains,
          losses: y.realizedLosses,
          taxable: y.taxable,
          ratePct: y.ratePct,
        }))
    : [
        {
          year: demoTax.year,
          owed: demoTax.due,
          paid: demoTax.due,
          refund: 0,
          registered: 0,
          shieldOut: 0,
          gains: demoTax.realizedGains,
          losses: demoTax.realizedLosses,
          taxable: demoTax.taxable,
          ratePct: demoTax.ratePct,
        },
      ];

  let view: TaxView;
  if (real) {
    const years = real.years.map((y) => y.year).sort((a, b) => b - a);
    const year = pickedYear && years.includes(pickedYear) ? pickedYear : years[0];
    const ledger = real.years.find((y) => y.year === year)!;
    view = {
      isReal: true,
      year,
      years,
      ratePct: ledger.ratePct,
      realizedGains: ledger.realizedGains,
      realizedLosses: ledger.realizedLosses,
      net: ledger.net,
      taxable: ledger.taxable,
      paid: ledger.paid,
      owedBeforeShield: ledger.owedBeforeShield,
      shieldApplied: ledger.shieldUsed,
      owed: ledger.owed,
      refund: ledger.refundNextYear,
      carriedFromYear: null,
      shieldLeft: ledger.shieldOut,
      shieldLossLeft: ledger.shieldLossOut,
      // The pool as the year's last month with activity left it — the same
      // reading `previewSell` reports as `poolAfter`.
      poolLeft: ledger.months.length > 0 ? ledger.months[ledger.months.length - 1].poolOut : 0,
      months: ledger.months.map((m) => ({
        month: m.month,
        gains: m.gains > 0 ? m.gains : null,
        losses: m.losses > 0 ? -m.losses : null,
        net: m.net,
        poolUsed: m.poolUsed,
        paid: m.paid,
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
      realizedGains: demoTax.realizedGains,
      realizedLosses: demoTax.realizedLosses,
      net: demoTax.realizedGains - demoTax.realizedLosses,
      taxable: demoTax.realizedGains - demoTax.realizedLosses,
      // The demo frames are static design data: they carry the withheld figures
      // per month and the post-shield bill, so the rest is derived from those.
      paid: demoMonthlyPaid,
      owedBeforeShield: demoTax.due + (demoTax.carriedLoss * demoTax.ratePct) / 100,
      shieldApplied: (demoTax.carriedLoss * demoTax.ratePct) / 100,
      owed: demoTax.due,
      refund: demoMonthlyPaid - demoTax.due,
      carriedFromYear: demoTax.carriedFromYear,
      shieldLeft: 0,
      shieldLossLeft: 0,
      poolLeft: 0,
      months: demoTax.months.map((m) => ({ ...m, paid: m.tax })),
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

  const shieldLabel =
    view.carriedFromYear !== null
      ? t('lossCarriedFrom', { year: view.carriedFromYear })
      : t('shieldApplied');

  const yearToggle = (
    <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-card p-[3px]" dir="ltr">
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
      <Row label={t('realizedLosses')} value={fmtNum(neg(view.realizedLosses), nl)} />
      <div className="h-px bg-border" />
      <Row label={t('taxable')} value={fmtNum(view.taxable, nl)} bold />
      <Row label={t('rate')} value={`${view.ratePct}%`} />
      <Row label={t('taxOnYear')} value={fmtNum(view.owedBeforeShield, nl)} />
      {view.shieldApplied > 0 && <Row label={shieldLabel} value={fmtNum(-view.shieldApplied, nl)} />}
      <div className="h-px bg-border" />
      <Row label={t('owed')} value={fmtNum(view.owed, nl)} bold big />
      {/* The cash side: withheld month by month, the excess back at filing. */}
      <Row label={t('withheldAtSource')} value={fmtNum(view.paid, nl)} />
      {view.refund > 0 && (
        <Row label={t('refundIn', { year: view.year + 1 })} value={fmtNum(view.refund, nl)} />
      )}
    </div>
  );

  const salesList = (
    <>
      {view.sales.map((s) => (
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

  // Mobile month accordions: newest first. Each one reports its own month and
  // nothing else — the year-to-date picture lives on the Yearly tab.
  const monthRows = [...view.months].sort((a, b) => b.month - a.month);
  const openMonthEff = openMonth === undefined ? (monthRows[0]?.month ?? null) : openMonth;
  const openYearEff = openYearState === undefined ? (yearRows[0]?.year ?? null) : openYearState;

  return (
    <main className="flex flex-1 flex-col">
      {/* ---------- Mobile (Figma Taxes frames: Monthly/Yearly accordions) ---------- */}
      <div className="flex flex-col md:hidden">
        <AppHeader />
        <h1 className="sr-only">{t('title')}</h1>

        {/* The two shields, which are not the same thing and are routinely
            taken for one: the broker's runs inside the year and settles at
            source, the tax authority's crosses years and settles at filing.
            Each carries the one sentence that tells them apart. */}
        <section className="mx-6 mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <ShieldRows pool={view.poolLeft} shield={view.shieldLeft} sym={sym} numberLocale={nl} />
        </section>

        <UnderlineTabs
          tabs={mobileTabs}
          value={mobileTab}
          onChange={setMobileTab}
          label={(k) => t(`tabs.${k}`)}
          grow
        />

        {mobileTab === 'monthly' && (
          <section ref={monthlyRef} className="flex scroll-mt-4 flex-col px-6 pt-6">
            {monthRows.map((m) => {
              const open = openMonthEff === m.month;
              const label = `${fmtMonth(m.month, locale, 'short')} ${view.year}`;
              return (
                <div key={m.month} className="border-b border-border py-4">
                  <button
                    type="button"
                    onClick={() => setOpenMonthRaw(open ? null : m.month)}
                    aria-expanded={open}
                    className="flex w-full flex-col gap-1 text-start"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <ChevronDown
                        className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                        aria-hidden
                      />
                    </span>
                    {!open && (
                      <span dir="ltr" className="private self-start text-xl font-bold text-foreground tabular-nums">
                        {sym}
                        {fmtNum(m.paid ?? 0, nl)}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 pt-1">
                      <p dir="ltr" className="private self-start text-[28px] font-bold tracking-tight text-foreground tabular-nums">
                        {sym}
                        {fmtNum(m.paid ?? 0, nl)}
                      </p>
                      <div className="flex flex-col gap-[7px] text-sm tabular-nums">
                        <Row label={t('realizedGains')} value={`${sym}${fmtNum(m.gains ?? 0, nl)}`} />
                        {/* MonthRow.losses is stored already-negated (or null
                            for a month with none), so negating it again both
                            printed "-0.00" on a quiet month and showed a real
                            loss as a positive number — the one place in the
                            app that did. */}
                        <Row label={t('realizedLosses')} value={`${sym}${fmtNum(m.losses ?? 0, nl)}`} />
                        <div className="h-px bg-border" />
                        <Row label={t('taxable')} value={`${sym}${fmtNum(m.net, nl)}`} bold />
                        <div className="flex justify-end">
                          <MoreLink href="/transactions">{t('transactionsDetails')}</MoreLink>
                        </div>
                        {/* Only earlier losses in this same year reach a month;
                            the registered shield settles at filing, not here. */}
                        {m.poolUsed > 0 && (
                          <Row label={t('offsetByPool')} value={`${sym}${fmtNum(-m.poolUsed, nl)}`} />
                        )}
                        <Row label={t('rate')} value={`${view.ratePct}%`} />
                        <div className="h-px bg-border" />
                        <Row
                          label={t('withheldThisMonth')}
                          value={m.paid === null ? t('shielded') : `${sym}${fmtNum(m.paid, nl)}`}
                          bold
                          big
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {mobileTab === 'yearly' && (
          <section className="flex flex-col px-6 pt-6">
            {yearRows.map((y) => {
              const open = openYearEff === y.year;
              return (
                <div key={y.year} className="border-b border-border py-4">
                  <button
                    type="button"
                    onClick={() => setOpenYearRaw(open ? null : y.year)}
                    aria-expanded={open}
                    className="flex w-full flex-col gap-1 text-start"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{y.year}</span>
                      <ChevronDown
                        className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
                        aria-hidden
                      />
                    </span>
                    {!open && (
                      <span dir="ltr" className="private self-start text-xl font-bold text-foreground tabular-nums">
                        {sym}
                        {fmtNum(y.paid, nl)}
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-3 pt-2">
                      {y.paid > 0 || y.owed > 0 ? (
                        <>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-muted-foreground">{t('withheldThisYear')}</span>
                            <span dir="ltr" className="private self-start text-[28px] font-bold tracking-tight text-foreground tabular-nums">
                              {sym}
                              {fmtNum(y.paid, nl)}
                            </span>
                          </div>
                          <div className="flex items-end justify-between">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-muted-foreground">
                                {t('trueLiability', { date: fmtDate(`${y.year + 1}-04-30`, locale) })}
                              </span>
                              <span dir="ltr" className="private self-start text-xl font-bold text-loss tabular-nums">
                                {sym}
                                {fmtNum(y.owed, nl)}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 text-end">
                              <span className="text-xs text-muted-foreground">{t('taxableShort')}</span>
                              <span dir="ltr" className="private self-end text-xl font-bold text-foreground tabular-nums">
                                {sym}
                                {fmtNum(y.taxable, nl)}
                              </span>
                            </div>
                          </div>
                          {/* The gap between the two comes back at filing. */}
                          {y.refund > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-muted-foreground">
                                {t('refundIn', { year: y.year + 1 })}
                              </span>
                              <span dir="ltr" className="private self-start text-xl font-bold text-gain tabular-nums">
                                {sym}
                                {fmtNum(y.refund, nl)}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-muted-foreground">
                            {y.registered > 0 ? t('shieldRegistered') : t('lossShield')}
                          </span>
                          <span className="flex items-center gap-2">
                            <Shield className="size-5 text-gain" aria-hidden />
                            <span dir="ltr" className="private text-[28px] font-bold tracking-tight text-foreground tabular-nums">
                              {sym}
                              {fmtNum(y.shieldOut, nl)}
                            </span>
                          </span>
                        </div>
                      )}
                      <MoreButton
                        onClick={() => {
                          setPickedYear(y.year);
                          setOpenMonthRaw(undefined); // back to "latest month open"
                          setMobileTab('monthly');
                          jumpToMonthly.current = true;
                        }}
                      >
                        {t('detailedView')}
                      </MoreButton>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
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
                  {t('withheldThisYear')}
                </h2>
                <p dir="ltr" className="private self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(view.paid, nl)}
                </p>
                {view.cash ? (
                  <>
                    <ReserveBar held={view.cash.held} due={view.paid} />
                    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>{t('heldInCash', { amount: fmtNum(view.cash.held, nl) })}</span>
                      <span>{t('short', { amount: fmtNum(view.cash.short, nl) })}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    {view.refund > 0
                      ? t('refundNote', {
                          amount: `${sym}${fmtNum(view.refund, nl)}`,
                          year: view.year + 1,
                        })
                      : t('withheldNote', { year: view.year })}
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
                {/* Money value leads; the loss standing behind it is secondary. */}
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {view.shieldLossLeft > 0 && (
                    <span className="private">
                      {t('behindLosses', { amount: `${sym}${fmtNum(view.shieldLossLeft, nl, 0)}` })}{' '}
                    </span>
                  )}
                  {view.shieldApplied > 0
                    ? t('usedNote', { amount: fmtNum(view.shieldApplied, nl) })
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
                <span className="text-end">{t('withheldAtRate', { rate: view.ratePct })}</span>
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
                    className={cn('private text-end', m.paid === null ? 'text-muted-foreground' : 'text-foreground')}
                  >
                    {m.paid === null ? t('shielded') : <span dir="ltr">{fmtNum(m.paid, nl)}</span>}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-6 py-3.5 text-sm font-semibold tabular-nums">
                <span className="text-foreground">{t('yearToDate')}</span>
                <span dir="ltr" className="private text-end text-gain">{fmtSigned(view.realizedGains, nl)}</span>
                <span dir="ltr" className="private text-end text-loss">{fmtSigned(-view.realizedLosses, nl)}</span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(view.net, nl)}</span>
                <span dir="ltr" className="private text-end text-foreground">{fmtNum(view.paid, nl)}</span>
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
                {t('salesIn', { year: view.year })}
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
                {view.shieldApplied > 0
                  ? t('shieldNoteApplied', {
                      amount: `${sym}${fmtNum(view.shieldApplied, nl, 0)}`,
                      taxYear: view.year,
                      refundYear: view.year + 1,
                    })
                  : t('shieldNoteNone', {
                      amount: `${sym}${fmtNum(view.shieldLeft, nl, 0)}`,
                      losses: `${sym}${fmtNum(view.shieldLossLeft, nl, 0)}`,
                    })}
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
