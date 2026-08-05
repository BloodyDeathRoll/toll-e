'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { routing } from '@/src/i18n/routing';
import { cn } from '@/lib/utils';

const labels: Record<string, string> = { en: 'English', he: 'עברית' };
const compactLabels: Record<string, string> = { en: 'EN', he: 'עב' };

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className={cn('flex gap-2', compact ? 'text-xs' : 'text-sm')}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          disabled={l === locale}
          onClick={() => router.replace(pathname, { locale: l })}
          className={cn(
            'rounded-md border border-border disabled:opacity-50 not-disabled:hover:bg-accent',
            compact ? 'px-2 py-0.5' : 'px-3 py-1',
          )}
        >
          {(compact ? compactLabels : labels)[l]}
        </button>
      ))}
    </div>
  );
}
