'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMarket } from '@/components/app-shell/market-context';
import { MoreLink } from '@/components/more-link';
import { ReserveBar } from '@/components/reserve-bar';
import { getMarket } from '@/src/markets/registry';
import { demo } from '@/src/demo/data';
import { fmtDate, fmtMonth, fmtNum, fmtSigned } from '@/lib/format';
import { cn } from '@/lib/utils';

export function TaxScreen() {
  const t = useTranslations('taxPage');
  const locale = useLocale();
  const { marketId } = useMarket();
  const market = getMarket(marketId);
  const tax = demo[marketId].tax;
  const nl = market.numberLocale;
  const sym = market.currencySymbol;
  const saved = (tax.carriedLoss * tax.ratePct) / 100;

  const yearToggle = (
    <div className="flex gap-0.5 rounded-lg border border-border bg-card p-[3px]" dir="ltr">
      {[tax.year, tax.year - 1].map((y) => (
        <span
          key={y}
          className={cn(
            'rounded-md px-3 py-[5px] text-xs tabular-nums',
            y === tax.year
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground',
          )}
        >
          {y}
        </span>
      ))}
    </div>
  );

  const howCalculated = (
    <div className="flex flex-col gap-[7px] text-sm tabular-nums">
      <Row label={t('realizedGains')} value={fmtNum(tax.realizedGains, nl)} />
      <Row label={t('realizedLosses')} value={fmtNum(-tax.realizedLosses, nl)} />
      <Row label={t('lossCarriedFrom', { year: tax.carriedFromYear })} value={fmtNum(-tax.carriedLoss, nl)} />
      <div className="h-px bg-border" />
      <Row label={t('taxable')} value={fmtNum(tax.taxable, nl)} bold />
      <Row label={t('rate')} value={`${tax.ratePct}%`} />
      <Row label={t('due')} value={fmtNum(tax.due, nl)} bold big />
    </div>
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
          <p dir="ltr" className="self-start text-[44px] font-semibold tracking-tighter text-foreground tabular-nums">
            {sym}
            {fmtNum(tax.due, nl)}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('setAsideNote', { year: tax.year })}
          </p>
          <ReserveBar held={tax.heldInCash} due={tax.due} />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{t('heldInCash', { amount: `${sym}${fmtNum(tax.heldInCash, nl)}` })}</span>
            <span>{t('short', { amount: `${sym}${fmtNum(tax.short, nl)}` })}</span>
          </div>
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
          {tax.months.map((m) => (
            <div
              key={m.month}
              className="flex items-center justify-between border-t border-border px-4 py-2.5 tabular-nums"
            >
              <span className="text-sm text-foreground">{fmtMonth(m.month, locale, 'short')}</span>
              <span className="flex gap-4">
                <span dir="ltr" className={cn('text-sm', m.net >= 0 ? 'text-gain' : 'text-loss')}>
                  {fmtSigned(m.net, nl)}
                </span>
                <span
                  dir="ltr"
                  className={cn(
                    'min-w-[76px] text-end text-sm',
                    m.tax === null ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {m.tax === null ? t('shielded') : fmtNum(m.tax, nl)}
                </span>
              </span>
            </div>
          ))}
          <div className="flex justify-end border-t border-border bg-well px-4 py-2.5">
            <MoreLink href="/tax">{t('exportYearReport', { year: tax.year })}</MoreLink>
          </div>
        </section>
      </div>

      {/* ---------- Desktop (design 3c) ---------- */}
      <div className="hidden flex-1 flex-col md:flex">
        <div className="flex items-center justify-between px-7 pt-[22px]">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
              {t('taxYear', { year: tax.year, rate: tax.ratePct })}
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
                <p dir="ltr" className="self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}
                  {fmtNum(tax.due, nl)}
                </p>
                <ReserveBar held={tax.heldInCash} due={tax.due} />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{t('heldInCash', { amount: fmtNum(tax.heldInCash, nl) })}</span>
                  <span>{t('short', { amount: fmtNum(tax.short, nl) })}</span>
                </div>
              </section>
              <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('netRealized')}
                </h2>
                <p dir="ltr" className="self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {fmtSigned(tax.realizedGains - tax.realizedLosses, nl, 0)}
                </p>
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {t('gainsMinusLosses', {
                    gains: fmtNum(tax.realizedGains, nl),
                    losses: fmtNum(tax.realizedLosses, nl),
                  })}
                </p>
              </section>
              <section className="flex flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('lossShieldLeft')}
                </h2>
                <p dir="ltr" className="self-start text-[32px] font-semibold tracking-tight text-foreground tabular-nums">
                  {sym}0
                </p>
                <p className="text-[13px] text-muted-foreground tabular-nums">
                  {t('usedInFull', { amount: fmtNum(tax.carriedLoss, nl), year: tax.carriedFromYear })}
                </p>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between px-6 pt-[18px] pb-3.5">
                <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                  {t('monthByMonth')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t('filingDue', { date: fmtDate(tax.filingDue, locale) })}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-6 py-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground">
                <span>{t('month')}</span>
                <span className="text-end">{t('gains')}</span>
                <span className="text-end">{t('losses')}</span>
                <span className="text-end">{t('net')}</span>
                <span className="text-end">{t('taxAtRate', { rate: tax.ratePct })}</span>
              </div>
              {tax.months.map((m) => (
                <div
                  key={m.month}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border px-6 py-[13px] text-sm tabular-nums"
                >
                  <span className="text-foreground">{fmtMonth(m.month, locale)}</span>
                  <span dir="ltr" className={cn('text-end', m.gains === null ? 'text-faint' : 'text-gain')}>
                    {m.gains === null ? '—' : fmtSigned(m.gains, nl)}
                  </span>
                  <span dir="ltr" className={cn('text-end', m.losses === null ? 'text-faint' : 'text-loss')}>
                    {m.losses === null ? '—' : fmtSigned(m.losses, nl)}
                  </span>
                  <span dir="ltr" className="text-end text-foreground">{fmtNum(m.net, nl)}</span>
                  <span
                    className={cn('text-end', m.tax === null ? 'text-muted-foreground' : 'text-foreground')}
                  >
                    {m.tax === null ? t('shielded') : fmtNum(m.tax, nl)}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] border-t border-border bg-well px-6 py-3.5 text-sm font-semibold tabular-nums">
                <span className="text-foreground">{t('yearToDate')}</span>
                <span dir="ltr" className="text-end text-gain">{fmtSigned(tax.realizedGains, nl)}</span>
                <span dir="ltr" className="text-end text-loss">{fmtSigned(-tax.realizedLosses, nl)}</span>
                <span dir="ltr" className="text-end text-foreground">
                  {fmtNum(tax.realizedGains - tax.realizedLosses, nl)}
                </span>
                <span dir="ltr" className="text-end text-foreground">{fmtNum(tax.due, nl)}</span>
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
              {tax.sales.map((s) => (
                <div
                  key={`${s.symbol}-${s.date}`}
                  className="flex items-center justify-between border-t border-border px-5 py-[13px]"
                >
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-sm font-semibold text-foreground">
                      {t('saleShares', {
                        symbol: locale === 'he' && s.nameHe ? s.nameHe : s.symbol,
                        shares: fmtNum(s.shares, nl, 0),
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(s.amount >= 0 ? 'saleGain' : 'saleLoss', { date: fmtDate(s.date, locale) })}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-[3px] tabular-nums">
                    <span dir="ltr" className={cn('text-sm', s.amount >= 0 ? 'text-gain' : 'text-loss')}>
                      {fmtSigned(s.amount, nl)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.tax === null ? t('shielded') : t('taxAmount', { amount: fmtNum(s.tax, nl) })}
                    </span>
                  </span>
                </div>
              ))}
              <div className="flex justify-end border-t border-border bg-well px-5 py-3">
                <MoreLink href="/portfolio">{t('allSales')}</MoreLink>
              </div>
            </section>

            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
                {t('lossShield')}
              </h2>
              <p className="text-sm leading-relaxed text-foreground">
                {t('shieldNote', {
                  year: tax.carriedFromYear,
                  amount: `${sym}${fmtNum(tax.carriedLoss, nl, 0)}`,
                  taxYear: tax.year,
                  saved: `${sym}${fmtNum(saved, nl, 0)}`,
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
      <span dir="ltr" className={cn('text-foreground', bold && 'font-semibold', big && 'text-base')}>
        {value}
      </span>
    </div>
  );
}
