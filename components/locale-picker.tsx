'use client';

import { useLocale } from 'next-intl';
import { usePathname } from '@/src/i18n/navigation';
import { Dropdown } from '@/components/dropdown';
import { routing } from '@/src/i18n/routing';

/** Each language named in itself — the only label a reader of it can read. */
const localeNames: Record<string, string> = { en: 'English', he: 'עברית' };

/**
 * The EN/HE dropdown, shared between Settings and the onboarding gate — the
 * gate is the first thing a new user sees, before Settings is reachable, so
 * it cannot be the one screen you can't read. These two are the *only* places
 * language can be changed: flags in the app chrome mean market now, and a
 * flag never meant a language anyway (which English? whose Hebrew?).
 *
 * Textual, therefore, and no badge.
 */
export function LocalePicker() {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <Dropdown
      options={routing.locales.map((l) => ({ value: l, name: localeNames[l] ?? l }))}
      active={locale}
      onPick={(l) => {
        // Remember the choice for the next visit. next-intl's middleware also
        // syncs this cookie, but only when the pick differs from the browser's
        // Accept-Language — writing it here makes "the language I last used"
        // an explicit record rather than a side effect of negotiation.
        document.cookie = `NEXT_LOCALE=${l};path=/;max-age=31536000;samesite=lax`;
        // Hard navigation — a client locale transition remounts the [locale]
        // layout and trips React's script-tag error (see app-header.tsx).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
        window.location.assign(`/${l}${pathname === '/' ? '' : pathname}`);
      }}
      showName
    />
  );
}
