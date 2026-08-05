'use client';

import { useTranslations } from 'next-intl';
import { Moon, Sun } from 'lucide-react';

// Dark is the default; the choice persists in localStorage and is applied
// pre-paint by the inline script in app/[locale]/layout.tsx.
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('common');

  const toggle = () => {
    const root = document.documentElement;
    const dark = root.classList.toggle('dark');
    localStorage.setItem('toll-e.theme', dark ? 'dark' : 'light');
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
