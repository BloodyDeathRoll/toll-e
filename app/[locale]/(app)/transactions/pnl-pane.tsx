'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useMarket } from '@/components/app-shell/market-context';
import { Dropdown } from '@/components/dropdown';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtDate, fmtMoney, fmtMoneySigned, fmtMonth, fmtNum } from '@/lib/format';
import type { PerformancePayload } from '@/src/server/performance';
import { cn } from '@/lib/utils';

/**
 * The P&L tab: the months that make the selected year up, each opening onto
 * the sells behind it. Was the body of the Performance screen before that page
 * and the transaction journal became two tabs of one.
 */
export function PnlPane({
  data,
  year,
  onYear,
}: {
  data: PerformancePayload;
  /** null = whichever year the server picked. */
  year: number | null;
  onYear: (y: number) => void;
}) {
  const t = useTranslations('perf');
  const tt = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = locale === 'he' ? 'he-IL' : 'en-US';
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const money = (v: number, ccy: string) => fmtMoney(v, ccy, nl);
  const signed = (v: number, ccy: string) => fmtMoneySigned(v, ccy, nl);
  // Negating a zero prints "-$0.00"; a month with no losses reads as a plain
  // zero.
  const neg = (v: number) => (v > 0 ? -v : 0);
  const monthRows = [...data.months].sort((a, b) => b.month - a.month);
  // The portfolio name only earns its place once there is more than one.
  const showPortfolio = data.portfolios.length > 1;

  return (
    // No card. The two tabs are one list seen two ways — the months here and
    // the trades that made them next door — so they are laid out the same:
    // rows on the page, ruled off from each other, rather than a panel of
    // months floating on a panel of screen.
    <div className="flex flex-col px-6 pt-4">
      {/* Only worth saying when a portfolio's own currency is not the one on
          screen — otherwise nothing was converted. */}
      {data.portfolios.some((p) => p.currency !== data.displayCurrency) && (
        <p className="pb-2 text-xs text-muted-foreground">
          {t('fxNote', { rate: fmtNum(data.fx.rate, nl, 3), date: fmtDate(data.fx.asOf, locale) })}
        </p>
      )}

      {data.months.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t('noSalesYear')}</p>
      ) : (
        <section className="flex flex-col">
          {/* The year picker lives here now: it scopes these months, and the
              card that used to hold it has moved to its own screen. */}
          <div className="flex items-center justify-between gap-3 pb-2">
            <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {tt('monthByMonth')}
            </h2>
            {/* Always offered, exactly like the Performance screen's — the
                current year alone is still a choice worth naming. */}
            <Dropdown
              options={data.years.map((y) => ({ value: String(y), name: String(y) }))}
              active={String(year ?? data.year)}
              onPick={(y) => onYear(Number(y))}
              showName
            />
          </div>

          {monthRows.map((m) => {
            const open = openMonth === m.month;
            const afterTax = m.net - m.tax;
            return (
              <div key={m.month} className="border-b border-border py-4">
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
                    {/* One line per sell action: what it realized, and what it
                        left after the tax withheld on it. */}
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
                            {/* A loss line needs no second figure — net is the
                                gain, untaxed. */}
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
                    {/* LOAD-BEARING: these two rows sit OUTSIDE the footing
                        above, on purpose, and must stay there. Trade
                        commissions are ALREADY inside m.gains/m.losses — the
                        engine folds them into basis and proceeds before
                        matching — so adding them again would double-count.
                        The account fee is in nothing above, but afterTax =
                        net − tax means one thing across the whole app, and
                        redefining this month's bottom line would change every
                        number the user has ever seen. Do not "fix" this by
                        footing them in. */}
                    {(m.costs > 0 || m.accountFee > 0) && (
                      <>
                        <div className="h-px bg-border" />
                        <div className="flex flex-col gap-[7px] text-xs tabular-nums">
                          {m.costs > 0 && (
                            <Row
                              label={`${t('tradeCommissions')} · ${t('alreadyReflected')}`}
                              value={money(m.costs, data.displayCurrency)}
                            />
                          )}
                          {m.accountFee > 0 && (
                            <Row
                              label={t('accountFees')}
                              value={money(-m.accountFee, data.displayCurrency)}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

export function Row({
  label,
  value,
  bold,
  big,
  strong,
}: {
  label: string;
  value: string;
  /** Both sides carry weight — a total. */
  bold?: boolean;
  big?: boolean;
  /** Only the figure carries weight: the label is still the quieter half. */
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span
        className={cn(
          bold ? 'font-semibold text-foreground' : 'text-muted-foreground',
          strong && 'text-sm',
        )}
      >
        {label}
      </span>
      <span
        dir="ltr"
        className={cn(
          'private text-foreground',
          bold && 'font-semibold',
          big && 'text-base',
          strong && 'text-base font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  );
}
