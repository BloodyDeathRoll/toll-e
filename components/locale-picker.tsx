'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { usePathname } from '@/src/i18n/navigation';
import { Dropdown } from '@/components/dropdown';
import { routing } from '@/src/i18n/routing';

/** Language is chosen by flag, exactly as in the header picker. */
function Flag({ locale }: { locale: string }) {
  return (
    <Image
      src={locale === 'he' ? '/flags/il.svg' : '/flags/us.svg'}
      alt={locale === 'he' ? 'עברית' : 'English'}
      width={18}
      height={17}
    />
  );
}

const localeNames: Record<string, string> = { en: 'English', he: 'עברית' };

/**
 * The EN/HE dropdown, shared between Settings and the onboarding gate — the
 * gate is the first thing a new user sees, before Settings is reachable, so
 * it cannot be the one screen you can't read.
 */
export function LocalePicker() {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <Dropdown
      options={routing.locales.map((l) => ({
        value: l,
        badge: <Flag locale={l} />,
        name: localeNames[l] ?? l,
      }))}
      active={locale}
      // Hard navigation — a client locale transition remounts the [locale]
      // layout and trips React's script-tag error (see app-header.tsx).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- hard reload is the point
      onPick={(l) => window.location.assign(`/${l}${pathname === '/' ? '' : pathname}`)}
    />
  );
}
