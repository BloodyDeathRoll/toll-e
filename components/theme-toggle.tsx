'use client';

import { useTranslations } from 'next-intl';
import { Moon, Sun } from 'lucide-react';
import { setTheme } from '@/lib/theme';

// System is the default; a choice persists in localStorage and is applied
// pre-paint by the inline script in app/[locale]/layout.tsx.
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('common');

  // A one-tap switch can only mean the palette you are not looking at, so it
  // always lands on an explicit choice — leaving 'system' to Settings, where
  // there is room to name it.
  const toggle = () => {
    setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('theme')}
      className={className ?? 'text-muted-foreground transition-colors hover:text-foreground'}
    >
      {/* Icon shows the theme you'd switch to — pure CSS, no hydration state. */}
      <Sun className="hidden size-4 dark:block" aria-hidden />
      <Moon className="size-4 dark:hidden" aria-hidden />
    </button>
  );
}
