'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Triangle } from 'lucide-react';
import { useMarket } from '@/components/app-shell/market-context';
import { lineMatches } from '@/components/app-shell/search-scope';
import { displaySymbol, getMarket } from '@/src/markets/registry';
import { fmtDate, fmtMoney, fmtMonth, fmtNum } from '@/lib/format';
import type { PerformancePayload } from '@/src/server/performance';
import { cn } from '@/lib/utils';

/**
 * The P&L tab: the months that make the selected year up, each opening onto
 * the sells behind it. Was the body of the Performance screen before that page
 * and the transaction journal became two tabs of one. The year picker lives
 * on the parent screen, above the tabs, because it scopes the journal too.
 *
 * Direction is carried by a triangle beside the figure, not by the figure's
 * colour — a column of green and red numbers stopped being readable the
 * moment the list grew past a screen. The figures themselves stay in the
 * default ink, unsigned; the triangle says which way.
 */
export function PnlPane({ data, query = '' }: { data: PerformancePayload; query?: string }) {
  const t = useTranslations('perf');
  const tt = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const nl = locale === 'he' ? 'he-IL' : 'en-US';
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const money = (v: number, ccy: string) => fmtMoney(v, ccy, nl);
  /** The figure in default ink, its direction as a triangle beside it. */
  const figure = (v: number, ccy: string, className: string) => (
    <span
      dir="ltr"
      className={cn('private flex items-center gap-1.5 tabular-nums text-foreground', className)}
    >
      {v !== 0 && (
        <Triangle
          className={cn('size-2.5 shrink-0 fill-current', v > 0 ? 'text-gain' : 'rotate-180 text-loss')}
          aria-hidden
        />
      )}
      {v < 0 && <span className="sr-only">−</span>}
      {money(Math.abs(v), ccy)}
    </span>
  );
  // Negating a zero prints "-$0.00"; a month with no losses reads as a plain
  // zero.
  const neg = (v: number) => (v > 0 ? -v : 0);
  // A month is kept if the search names it, or names anything sold inside it —
  // the row you are looking for is a month either way, since that is the unit
  // this list is made of.
  const monthLabel = (m: PerformancePayload['months'][number]) =>
    `${fmtMonth(m.month, locale, 'long')} ${data.year}`;
  // The rate the withholding was computed at, named on the row it produced.
  // Only when the scoped portfolios agree on one: two rates behind a single
  // converted figure is not something a bracket can say.
  const rates = new Set(data.portfolios.map((p) => p.ratePct));
  const taxLabel =
    rates.size === 1 ? tt('taxRowAt', { rate: [...rates][0] }) : tt('taxRow');
  const monthRows = [...data.months]
    .filter((m) =>
      lineMatches(
        query,
        monthLabel(m),
        fmtMonth(m.month, locale, 'short'),
        ...m.sales.flatMap((s) => [displaySymbol(s.symbol, market), s.portfolio, s.date]),
      ),
    )
    .sort((a, b) => b.month - a.month);
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
      ) : monthRows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t('noMatches', { query: query.trim() })}</p>
      ) : (
        <section className="flex flex-col">
          {monthRows.map((m) => {
            const open = openMonth === m.month;
            // The account fee is part of the month's bottom line here (user
            // decision 2026-08-14): an ended month that didn't offset the
            // minimum paid it, and the month's figure should say so. Trade
            // commissions stay OUT — they are already inside gains/losses.
            // The fee is always 0 for the still-running month.
            const monthTotal = m.net - m.tax - m.accountFee;
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
                  {!open && figure(monthTotal, data.displayCurrency, 'self-start text-xl font-bold')}
                </button>
                {open && (
                  <div className="flex flex-col gap-2 pt-1">
                    {figure(monthTotal, data.displayCurrency, 'self-start text-[28px] font-bold tracking-tight')}
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
                            {figure(s.net, data.displayCurrency, 'text-sm')}
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
                      <Row label={taxLabel} value={money(-m.tax, data.displayCurrency)} />
                      {/* A charged account fee foots into the month — but
                          ONLY the fee. Trade commissions must stay outside:
                          they are already inside m.gains/m.losses (the
                          engine folds them into basis and proceeds before
                          matching), so footing them in would double-count. */}
                      {/* A month whose commissions covered the fee still gets
                          the line: the fee existed and the trading paid for
                          it, which is the offset broker's whole bargain.
                          Dropping the row would read as "no fee here", and
                          leaving the amount would claim a charge nobody
                          collected. */}
                      {(m.accountFee > 0 || m.accountFeeOffset) && (
                        <Row
                          label={t('accountFees')}
                          value={
                            m.accountFeeOffset
                              ? t('feeIncluded')
                              : money(-m.accountFee, data.displayCurrency)
                          }
                        />
                      )}
                      <div className="h-px bg-border" />
                      {/* The month's bottom line sits as far below the rule as
                          it does above the month's own border — the 7px flex
                          gap alone left it crowding the rows it sums while
                          the 16px under it read as open space. */}
                      <div className="pt-[9px]">
                        <Row
                          label={t('monthNet')}
                          value={money(monthTotal, data.displayCurrency)}
                          bold
                          big
                        />
                      </div>
                    </div>
                    {m.costs > 0 && (
                      <>
                        <div className="h-px bg-border" />
                        <div className="flex flex-col gap-[7px] text-xs tabular-nums">
                          <Row
                            label={`${t('tradeCommissions')} · ${t('alreadyReflected')}`}
                            value={money(m.costs, data.displayCurrency)}
                          />
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
