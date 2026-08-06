'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { getMarket } from '@/src/markets/registry';
import { fmtDate, fmtMoney, fmtMoneySigned, fmtMonth, fmtNum } from '@/lib/format';
import type { PerformancePayload } from '@/src/server/performance';
import { cn } from '@/lib/utils';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'empty' }
  | { status: 'data'; data: PerformancePayload };

/**
 * Performance / Profile (§3.4) — the combined picture across portfolios in
 * the user's display currency, native figures primary with the conversion in
 * brackets. Also the profile surface: display currency, language, default
 * market. No design frame exists for this page; it follows the app's system.
 */
export function PerformanceScreen() {
  const t = useTranslations('perf');
  const tt = useTranslations('taxPage');
  const locale = useLocale();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [year, setYear] = useState<number | null>(null);
  // Display currency comes from the account setting (changed on /settings).
  const currency = null as string | null;
  const nl = locale === 'he' ? 'he-IL' : 'en-US';

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    if (currency) params.set('currency', currency);
    try {
      const res = await fetch(`/api/performance?${params}`);
      if (res.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setState(json.empty ? { status: 'empty' } : { status: 'data', data: json });
    } catch {
      setState((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
    }
  }, [year, currency]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on param change
    load();
  }, [load]);

  const data = state.status === 'data' ? state.data : null;
  const money = (v: number, ccy: string) => fmtMoney(v, ccy, nl);
  const signed = (v: number, ccy: string) => fmtMoneySigned(v, ccy, nl);

  const statCard = (label: string, value: number, gainLoss = true) => (
    <section className="flex flex-1 flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
        {label}
      </h2>
      <p
        dir="ltr"
        className={cn(
          'private self-start text-[26px] font-semibold tracking-tight tabular-nums md:text-[30px]',
          gainLoss ? (value >= 0 ? 'text-gain' : 'text-loss') : 'text-foreground',
        )}
      >
        {data && (gainLoss ? signed(value, data.displayCurrency) : money(value, data.displayCurrency))}
      </p>
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3.5 p-4 md:gap-5 md:py-7">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
        {data && data.years.length > 0 && (
          <div className="flex gap-0.5 rounded-lg border border-border bg-card p-[3px]" dir="ltr">
            {data.years.slice(0, 3).map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={cn(
                  'rounded-md px-3 py-[5px] text-xs tabular-nums',
                  y === data.year
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {state.status === 'loading' && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
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
            {t('emptyCta')}
          </Link>
        </section>
      )}

      {data && (
        <>
          {/* Combined totals — display currency */}
          <div className="flex flex-col gap-3.5 md:flex-row md:gap-5">
            {statCard(t('realizedYtd', { year: data.year }), data.totals.realized)}
            {statCard(t('unrealized'), data.totals.unrealized)}
            {statCard(t('taxAccrued'), data.totals.taxDue, false)}
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            {t('fxNote', {
              rate: fmtNum(data.fx.rate, nl, 3),
              date: fmtDate(data.fx.asOf, locale),
            })}
          </p>

          {/* Per-portfolio breakdown — native primary, converted in brackets */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <h2 className="px-5 pt-[18px] pb-3 text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('byPortfolio')}
            </h2>
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_1fr] border-t border-border bg-well px-5 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground md:grid">
              <span>{t('portfolio')}</span>
              <span className="text-end">{t('realizedCol')}</span>
              <span className="text-end">{t('unrealizedCol')}</span>
              <span className="text-end">{t('taxCol')}</span>
              <span className="text-end">{t('shieldCol')}</span>
            </div>
            {data.portfolios.map((p) => {
              const showBrackets = p.currency !== data.displayCurrency;
              const cell = (native: number, converted: number, gainLoss = true) => (
                <span className="flex flex-col items-end gap-0.5 tabular-nums">
                  <span
                    dir="ltr"
                    className={cn(
                      'text-sm',
                      gainLoss ? (native >= 0 ? 'text-gain' : 'text-loss') : 'text-foreground',
                    )}
                  >
                    {gainLoss ? signed(native, p.currency) : money(native, p.currency)}
                  </span>
                  {showBrackets && (
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      ({gainLoss ? signed(converted, data.displayCurrency) : money(converted, data.displayCurrency)})
                    </span>
                  )}
                </span>
              );
              return (
                <div
                  key={p.id}
                  className="grid grid-cols-2 gap-y-3 border-t border-border px-5 py-3.5 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] md:gap-y-0"
                >
                  <span className="col-span-2 flex flex-col gap-0.5 md:col-span-1">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {getMarket(p.market).currencySymbol} {p.currency} · {p.market}
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 md:hidden">
                    <span className="text-[11px] uppercase text-muted-foreground">{t('realizedCol')}</span>
                  </span>
                  {cell(p.realized, p.converted.realized)}
                  <span className="flex flex-col gap-0.5 md:hidden">
                    <span className="text-[11px] uppercase text-muted-foreground">{t('unrealizedCol')}</span>
                  </span>
                  {cell(p.unrealized, p.converted.unrealized)}
                  <span className="flex flex-col gap-0.5 md:hidden">
                    <span className="text-[11px] uppercase text-muted-foreground">{t('taxCol')}</span>
                  </span>
                  {cell(p.taxDue, p.converted.taxDue, false)}
                  <span className="flex flex-col gap-0.5 md:hidden">
                    <span className="text-[11px] uppercase text-muted-foreground">{t('shieldCol')}</span>
                  </span>
                  <span dir="ltr" className="flex items-start justify-end text-sm text-foreground tabular-nums">
                    {money(p.shieldRemaining, p.currency)}
                  </span>
                </div>
              );
            })}
          </section>

          {/* Combined month-by-month — display currency */}
          {data.months.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {tt('monthByMonth')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t('combinedIn', { currency: data.displayCurrency })}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-5 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground">
                <span>{tt('month')}</span>
                <span className="text-end">{tt('gains')}</span>
                <span className="text-end">{tt('losses')}</span>
                <span className="text-end">{tt('net')}</span>
                <span className="text-end">{t('taxCol')}</span>
              </div>
              {data.months.map((m) => (
                <div
                  key={m.month}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border px-5 py-3 text-sm tabular-nums"
                >
                  <span className="text-foreground">{fmtMonth(m.month, locale)}</span>
                  <span dir="ltr" className={cn('text-end', m.gains > 0 ? 'text-gain' : 'text-faint')}>
                    {m.gains > 0 ? fmtNum(m.gains, nl) : '—'}
                  </span>
                  <span dir="ltr" className={cn('text-end', m.losses > 0 ? 'text-loss' : 'text-faint')}>
                    {m.losses > 0 ? fmtNum(-m.losses, nl) : '—'}
                  </span>
                  <span dir="ltr" className="text-end text-foreground">{fmtNum(m.net, nl)}</span>
                  <span dir="ltr" className="text-end text-foreground">{fmtNum(m.tax, nl)}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

    </main>
  );
}
