import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { InstallPrompt } from '@/components/install-prompt';
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
  applicationName: 'toll-e',
  // iOS ignores the web manifest, so the installed-app identity comes from these.
  appleWebApp: { capable: true, title: 'toll-e', statusBarStyle: 'black-translucent' },
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  // viewport-fit=cover + env(safe-area-inset-*) is what keeps the bottom tab bar
  // clear of the home indicator once installed.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0b' },
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Dark is the SSR default; this runs before paint so a stored light
// preference never flashes dark first. Same for number privacy: restoring it
// pre-paint means private amounts never flash visible.
const themeInit = `try{if(localStorage.getItem('toll-e.theme')==='light')document.documentElement.classList.remove('dark');if(localStorage.getItem('toll-e.privacy')==='on')document.documentElement.dataset.privacy='on'}catch(e){}`;

// Two things that must run before React hydrates:
// 1. Chrome's install offer can fire before the bundle parses, and is only
//    usable later if preventDefault() runs synchronously — so the listener is
//    inline and stashes the event for lib/install.ts to find.
// 2. The service worker registration, which (with the manifest) is what makes
//    Chrome consider the app installable in the first place.
const installInit = `window.__TOLLE_BIP=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__TOLLE_BIP=e;dispatchEvent(new Event('toll-e:installable'))});if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: installInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <NextIntlClientProvider>
          {children}
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
