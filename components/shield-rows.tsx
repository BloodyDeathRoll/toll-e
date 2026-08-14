'use client';

import { useTranslations } from 'next-intl';
import { InfoDot } from '@/components/info-dot';
import { fmtNum } from '@/lib/format';

/**
 * The two tax shields, side by side wherever they appear — the Tax screen and
 * the transactions summary card show the same pair from the same code, because
 * the whole point of naming them separately is that they are routinely taken
 * for one thing: the broker's runs inside the year and settles at source, the
 * tax authority's crosses years and settles at filing.
 *
 * The bubble hangs from the row rather than the dot: a 14rem tooltip is 252px
 * at this root size, and anchored two-thirds of the way across a phone-width
 * card it would run off the edge.
 */
export function ShieldRows({
  pool,
  shield,
  sym,
  numberLocale,
  poolOnly,
}: {
  /** Realized losses still in this year's at-source pool. */
  pool: number;
  /** Registered shield, at its money value. */
  shield: number;
  sym: string;
  numberLocale: string;
  /**
   * Show only the brokerage row. The IRS shield's presentation is being
   * reworked against a coming write-up; the Tax screen's top card hides it
   * until then.
   */
  poolOnly?: boolean;
}) {
  const t = useTranslations('taxPage');
  const rows = [
    { label: t('brokerageShield'), note: t('brokerageShieldInfo'), value: pool },
    ...(poolOnly ? [] : [{ label: t('irsShield'), note: t('irsShieldInfo'), value: shield }]),
  ];
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} className="relative flex items-start justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {r.label}
            <InfoDot label={r.label} note={r.note} className="static" />
          </span>
          <span dir="ltr" className="private text-base font-semibold text-foreground tabular-nums">
            {sym}
            {fmtNum(r.value, numberLocale, 0)}
          </span>
        </div>
      ))}
    </>
  );
}
