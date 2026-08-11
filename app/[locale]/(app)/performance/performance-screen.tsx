'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { useMarket } from '@/components/app-shell/market-context';
import { Dropdown } from '@/components/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtDate, fmtMoney, fmtMoneySigned, fmtMonth, fmtNum } from '@/lib/format';
import type { PerformancePayload } from '@/src/server/performance';
import { cn } from '@/lib/utils';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'empty' }
  | { status: 'data'; data: PerformancePayload };

/**
 * Performance (§3.4) — the picture for the market being viewed: its
 * portfolios, in its own currency. Scoped to the lens like every other
 * screen, so ₪ never shows a dollar portfolio's numbers. No design frame
 * exists for this page; it follows the app's system.
 */
export function PerformanceScreen() {
  const t = useTranslations('perf');
  const tt = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [year, setYear] = useState<number | null>(null);
  // Months start collapsed; null = none open.
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const nl = locale === 'he' ? 'he-IL' : 'en-US';
  // Only the newest request may write state: the lens hydrates a beat after
  // mount, so the previous market's request is often still in flight.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const apply = (next: State) => {
      if (gen.current === mine) setState(next);
    };
    const params = new URLSearchParams({ market: marketId });
    if (year) params.set('year', String(year));
    try {
      const res = await fetch(`/api/performance?${params}`);
      if (res.status === 401) {
        apply({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      apply(json.empty ? { status: 'empty' } : { status: 'data', data: json });
    } catch {
      if (gen.current === mine) {
        setState((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
      }
    }
  }, [year, marketId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on lens/year change
    setState({ status: 'loading' });
    load();
  }, [load]);

  const data = state.status === 'data' ? state.data : null;
  const yearTotals = (data?.months ?? []).reduce(
    (a, m) => ({
      gains: a.gains + m.gains,
      losses: a.losses + m.losses,
      net: a.net + m.net,
      tax: a.tax + m.tax,
    }),
    { gains: 0, losses: 0, net: 0, tax: 0 },
  );
  // Newest month first, like the tax screen's monthly tab.
  const monthRows = [...(data?.months ?? [])].sort((a, b) => b.month - a.month);
  // The portfolio name only earns its place once there is more than one.
  const showPortfolio = (data?.portfolios.length ?? 0) > 1;
  const money = (v: number, ccy: string) => fmtMoney(v, ccy, nl);
  // Flip a positive magnitude to its negative, leaving zero alone — `-0`
  // formats as "-$0.00".
  const neg = (v: number) => (v > 0 ? -v : 0);
  const signed = (v: number, ccy: string) => fmtMoneySigned(v, ccy, nl);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3.5 p-4 md:gap-5 md:py-7">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">{t('title')}</h1>
        {/* One year at a time — the card, the months and every sale below all
            report the year picked here. */}
        {data && data.years.length > 0 && (
          <Dropdown
            options={data.years.map((y) => ({ value: String(y), name: String(y) }))}
            active={String(data.year)}
            onPick={(y) => setYear(Number(y))}
            showName
          />
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
          {/* Top card: the whole year in one place — what was realized, what
              is still on paper, and the cash the broker withheld. */}
          <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('realizedIn', { year: data.year })}
              </h2>
              <p
                dir="ltr"
                className={cn(
                  'private self-start text-[28px] font-bold tracking-tight tabular-nums',
                  yearTotals.net >= 0 ? 'text-gain' : 'text-loss',
                )}
              >
                {signed(yearTotals.net, data.displayCurrency)}
              </p>
              <div className="flex flex-col gap-[7px] pt-1 text-sm tabular-nums">
                <Row label={tt('gains')} value={money(yearTotals.gains, data.displayCurrency)} />
                {/* Negating a zero prints "-$0.00"; a month or year with no losses
                    should read as a plain zero. */}
                <Row label={tt('losses')} value={money(neg(yearTotals.losses), data.displayCurrency)} />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-1">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('unrealized')}
              </h2>
              <p
                dir="ltr"
                className={cn(
                  'private self-start text-[28px] font-bold tracking-tight tabular-nums',
                  data.totals.unrealized >= 0 ? 'text-gain' : 'text-loss',
                )}
              >
                {signed(data.totals.unrealized, data.displayCurrency)}
              </p>
              <p className="text-xs text-muted-foreground">{t('unrealizedNote')}</p>
            </div>

            <div className="h-px bg-border" />

            {/* Withheld leads — it is the cash actually gone. When the shield
                or month ordering makes the year owe less, both sides show. */}
            <div className="flex flex-col gap-[7px] text-sm tabular-nums">
              <Row label={t('taxPaidCard')} value={money(yearTotals.tax, data.displayCurrency)} bold big />
              {data.totals.taxRefund > 0 && (
                <>
                  <Row label={t('shouldHavePaid')} value={money(data.totals.taxOwed, data.displayCurrency)} />
                  <Row
                    label={t('refundIn', { year: data.year + 1 })}
                    value={money(data.totals.taxRefund, data.displayCurrency)}
                  />
                </>
              )}
            </div>
          </section>

          {/* Only worth saying when a portfolio's own currency is not the one
              on screen — otherwise nothing was converted. */}
          {data.portfolios.some((p) => p.currency !== data.displayCurrency) && (
            <p className="px-1 text-xs text-muted-foreground">
              {t('fxNote', {
                rate: fmtNum(data.fx.rate, nl, 3),
                date: fmtDate(data.fx.asOf, locale),
              })}
            </p>
          )}

          {/* The months that make the year up — same shape as the tax screen's
              monthly tab, but about gains and losses rather than the bill.
              Every sell action gets its own line. */}
          {data.months.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-3">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {tt('monthByMonth')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t('combinedIn', { currency: data.displayCurrency })}
                </span>
              </div>

              {/* Month accordions, newest first. */}
              {monthRows.map((m) => {
                const open = openMonth === m.month;
                const afterTax = m.net - m.tax;
                return (
                  <div key={m.month} className="border-t border-border px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setOpenMonth(open ? null : m.month)}
                      aria-expanded={open}
                      className="flex w-full flex-col gap-1 text-start"
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {fmtMonth(m.month, locale, 'short')} {data.year}
                        </span>
                        <ChevronDown
                          className={cn(
                            'size-4 text-muted-foreground transition-transform',
                            open && 'rotate-180',
                          )}
                          aria-hidden
                        />
                      </span>
                      {!open && (
                        <span
                          dir="ltr"
                          className={cn(
                            'private self-start text-xl font-bold tabular-nums',
                            afterTax >= 0 ? 'text-gain' : 'text-loss',
                          )}
                        >
                          {signed(afterTax, data.displayCurrency)}
                        </span>
                      )}
                    </button>
                    {open && (
                      <div className="flex flex-col gap-2 pt-1">
                        <p
                          dir="ltr"
                          className={cn(
                            'private self-start text-[28px] font-bold tracking-tight tabular-nums',
                            afterTax >= 0 ? 'text-gain' : 'text-loss',
                          )}
                        >
                          {signed(afterTax, data.displayCurrency)}
                        </p>
                        {/* One line per sell action: what it realized, and what
                            it left after the tax withheld on it. */}
                        <div className="flex flex-col gap-3 pt-1">
                          {m.sales.map((s) => (
                            <div key={s.id} className="flex items-start justify-between gap-3">
                              <span className="flex flex-col gap-[3px]">
                                <span className="text-sm font-semibold text-foreground">
                                  {tt('saleShares', {
                                    symbol: displaySymbol(s.symbol, market),
                                    shares: fmtNum(s.shares, nl, 0),
                                  })}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {tt(s.gain >= 0 ? 'saleGain' : 'saleLoss', {
                                    date: fmtDate(s.date, locale),
                                  })}
                                  {showPortfolio && ` · ${s.portfolio}`}
                                </span>
                              </span>
                              <span className="private flex flex-col items-end gap-[3px] tabular-nums">
                                <span
                                  dir="ltr"
                                  className={cn('text-sm', s.net >= 0 ? 'text-gain' : 'text-loss')}
                                >
                                  {signed(s.net, data.displayCurrency)}
                                </span>
                                {/* A loss line needs no second figure — net is
                                    the gain, untaxed. */}
                                {(s.tax > 0 || s.gain > 0) && (
                                  <span className="text-xs text-muted-foreground">
                                    {s.tax > 0
                                      ? t('afterTax', { amount: money(s.tax, data.displayCurrency) })
                                      : tt('shielded')}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="h-px bg-border" />
                        <div className="flex flex-col gap-[7px] text-sm tabular-nums">
                          <Row label={tt('gains')} value={money(m.gains, data.displayCurrency)} />
                          <Row label={tt('losses')} value={money(neg(m.losses), data.displayCurrency)} />
                          <Row label={t('paidCol')} value={money(-m.tax, data.displayCurrency)} />
                          <div className="h-px bg-border" />
                          <Row
                            label={t('netAfterTax')}
                            value={money(afterTax, data.displayCurrency)}
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
        </>
      )}

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
    <div className="flex justify-between gap-3">
      <span className={cn(bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
        {label}
      </span>
      <span dir="ltr" className={cn('private text-foreground', bold && 'font-semibold', big && 'text-base')}>
        {value}
      </span>
    </div>
  );
}
