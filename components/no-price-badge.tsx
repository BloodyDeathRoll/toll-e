'use client';

import { useTranslations } from 'next-intl';

/**
 * Shown on a holding whose price could not be fetched — from the provider or
 * from the persisted closes behind it. The row falls back to the lot cost, and
 * without this chip that is indistinguishable from a real quote on a flat day:
 * same number, zero day change. Says which one the reader is looking at.
 */
export function NoPriceBadge({ show }: { show: boolean }) {
  const t = useTranslations('common');
  if (!show) return null;
  return (
    <span
      title={t('noPriceHint')}
      className="rounded-[4px] bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
    >
      {t('noPrice')}
    </span>
  );
}
