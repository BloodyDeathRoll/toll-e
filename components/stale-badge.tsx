'use client';

import { useTranslations } from 'next-intl';

/**
 * Shown when a live-data hook reports `stale: true` — the screen keeps its
 * last good values, this chip says they may be behind.
 */
export function StaleBadge({ show }: { show: boolean }) {
  const t = useTranslations('common');
  if (!show) return null;
  return (
    <span className="rounded-[4px] bg-loss/15 px-1.5 py-0.5 text-[11px] font-semibold text-loss">
      {t('stale')}
    </span>
  );
}
