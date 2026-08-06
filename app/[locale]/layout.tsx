import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Geist_Mono, Inter, Rubik } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing, localeDir } from '@/src/i18n/routing';
import '../globals.css';

// Inter has no Hebrew glyphs — Rubik backfills them via the font stack.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const rubik = Rubik({ variable: '--font-rubik', subsets: ['hebrew', 'latin'] });

export const metadata: Metadata = {
  title: { default: 'toll-e', template: '%s · toll-e' },
  description: 'Investment tracking with real tax clarity for Israeli investors',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Dark is the SSR default; this runs before paint so a stored light
// preference never flashes dark first. Same for number privacy: restoring it
// pre-paint means private amounts never flash visible.
const themeInit = `try{if(localStorage.getItem('toll-e.theme')==='light')document.documentElement.classList.remove('dark');if(localStorage.getItem('toll-e.privacy')==='on')document.documentElement.dataset.privacy='on'}catch(e){}`;

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      className={`${inter.variable} ${geistMono.variable} ${rubik.variable} dark h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
