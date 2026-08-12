import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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
    { media: '(prefers-color-scheme: dark)', color: '#1b1b1b' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
      className={`${inter.variable} ${geistMono.variable} ${rubik.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Pre-hydration theme/privacy/install init (public/init.js). A
            next/script src with beforeInteractive executes before paint and,
            unlike a raw inline <script>, survives client re-renders on locale
            switch without React's script-tag error. */}
        <Script src="/init.js" strategy="beforeInteractive" />
        <NextIntlClientProvider>
          {/* On a phone these two wrappers are `display: contents` and this
              is the same tree it has always been; on a wide screen they are
              the backdrop and the device. See app/globals.css. */}
          <div className="app-stage">
            <div className="app-device">
              <div className="app-frame app-scroll flex min-h-full flex-1 flex-col">{children}</div>
              {/* Inside the device, so the sheet rises from the phone's own
                  bottom edge rather than the window's. */}
              <InstallPrompt />
            </div>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
