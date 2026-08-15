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
  show = 'both',
}: {
  /** Realized losses still in this year's at-source pool. */
  pool: number;
  /** Registered shield, at its money value. */
  shield: number;
  sym: string;
  numberLocale: string;
  /**
   * Which rows to render:
   *  - `both` (default) — the pair, each naming whose shield it is.
   *  - `brokerage` / `irs` — one row, still qualified, because the other
   *    shield is elsewhere on the same screen (Performance gives each a card).
   *  - `pool` — the brokerage row alone and unqualified, for the Tax screen,
   *    where the IRS shield does not appear at all.
   */
  show?: 'both' | 'brokerage' | 'irs' | 'pool';
}) {
  const t = useTranslations('taxPage');
  // Alone on its screen, the row is simply "Tax shield" — the qualifier only
  // earns its keep when there are two shields to tell apart, and the pair is
  // what the tooltip is for. Beside the IRS shield it names its own again.
  const brokerage = { label: t('brokerageShield'), note: t('brokerageShieldInfo'), value: pool };
  const irs = { label: t('irsShield'), note: t('irsShieldInfo'), value: shield };
  const rows =
    show === 'pool'
      ? [{ label: t('poolShield'), note: t('poolShieldInfo'), value: pool }]
      : show === 'brokerage'
        ? [brokerage]
        : show === 'irs'
          ? [irs]
          : [brokerage, irs];
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
