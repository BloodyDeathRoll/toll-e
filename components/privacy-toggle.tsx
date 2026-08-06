'use client';

import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '@/components/use-privacy';

/** Eye button that hides/shows personal amounts app-wide. */
export function PrivacyToggle({ className }: { className?: string }) {
  const t = useTranslations('settings');
  const { on, toggle } = usePrivacy();
  const Icon = on ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('hideAmounts')}
      aria-pressed={on}
      className={className ?? 'text-muted-foreground transition-colors hover:text-foreground'}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
