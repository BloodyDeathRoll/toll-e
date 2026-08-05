import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'he'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

export const localeDir = (locale: string): 'ltr' | 'rtl' =>
  locale === 'he' ? 'rtl' : 'ltr';
