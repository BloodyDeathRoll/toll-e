'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  INSTALLABLE_EVENT,
  installOffer,
  manualInstallOffer,
  markInstallSeen,
  runInstall,
  type InstallOffer,
} from '@/lib/install';

// Wait for the first data to land before interrupting — an install sheet over
// a screen of skeletons asks the user to commit to something they can't see yet.
const SETTLE_MS = 2_500;

/** Add-to-home-screen sheet, offered until it is answered (see lib/install.ts).
    Chromium gets a button wired to its own install dialog; browsers that can
    install but expose no API for it (iOS Safari, Firefox for Android) get the
    one sentence that says where their control lives. */
export function InstallPrompt() {
  const t = useTranslations('install');
  const [offer, setOffer] = useState<InstallOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    let armed = false;

    const evaluate = () => {
      if (disposed || !armed) return;
      const next = installOffer();
      // Marked seen only once the user answers it, not on sight.
      if (next) setOffer(next);
    };
    const onInstalled = () => {
      if (!disposed) setOffer(null);
    };

    // Chrome's offer often lands after mount; the layout re-broadcasts it.
    addEventListener(INSTALLABLE_EVENT, evaluate);
    addEventListener('appinstalled', onInstalled);
    const timer = setTimeout(() => {
      armed = true;
      evaluate();
    }, SETTLE_MS);

    return () => {
      disposed = true;
      clearTimeout(timer);
      removeEventListener(INSTALLABLE_EVENT, evaluate);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!offer) return null;

  const dismiss = () => {
    markInstallSeen(); // answered — a reload won't ask again
    setOffer(null);
  };
  const install = async () => {
    setBusy(true);
    await runInstall().catch(() => false); // cancelled, or the offer went stale
    setBusy(false);
    dismiss();
  };

  return (
    <div className="app-frame fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label={t('close')}
        onClick={dismiss}
        className="absolute inset-0 bg-black/45 motion-safe:animate-in motion-safe:fade-in"
      />
      <section
        role="dialog"
        aria-labelledby="install-title"
        className="relative flex w-full max-w-md flex-col items-center gap-3 rounded-t-[22px] border border-border bg-card px-6 pt-7 pb-[calc(24px+env(safe-area-inset-bottom))] text-center motion-safe:animate-in motion-safe:slide-in-from-bottom sm:mb-6 sm:rounded-[22px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static icon, no optimization needed */}
        <img src="/icon-192.png" alt="" width={54} height={54} className="rounded-xl" />
        <h2 id="install-title" className="text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {offer === 'ios' ? t.rich('iosBody', bold) : offer === 'firefox' ? t.rich('firefoxBody', bold) : t('body')}
        </p>
        <div className="mt-1 flex w-full gap-2.5">
          {offer !== 'prompt' ? (
            <button
              type="button"
              onClick={dismiss}
              className="h-11 flex-1 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              {t('gotIt')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={dismiss}
                className="h-11 flex-1 rounded-lg border border-border bg-background text-[15px] text-subtle"
              >
                {t('later')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void install()}
                className="h-11 flex-1 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                {t('install')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const bold = { b: (chunks: React.ReactNode) => <b className="text-foreground">{chunks}</b> };

/** Standing way back into the install, for anyone who dismissed the sheet or
    never saw it. Hidden entirely when toll-e is already installed, or when the
    browser has no install path at all. */
export function InstallSettingsRow() {
  const t = useTranslations('install');
  const [offer, setOffer] = useState<InstallOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const evaluate = () => setOffer(manualInstallOffer());
    evaluate();
    addEventListener(INSTALLABLE_EVENT, evaluate);
    addEventListener('appinstalled', evaluate);
    return () => {
      removeEventListener(INSTALLABLE_EVENT, evaluate);
      removeEventListener('appinstalled', evaluate);
    };
  }, []);

  if (!offer) return null;

  const install = async () => {
    setBusy(true);
    await runInstall().catch(() => false);
    setBusy(false);
    setOffer(manualInstallOffer());
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-semibold tracking-[0.06em] uppercase text-muted-foreground">
          {t('sectionTitle')}
        </h2>
        {offer === 'prompt' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void install()}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {t('install')}
          </button>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {offer === 'ios' ? t.rich('iosBody', bold) : offer === 'firefox' ? t.rich('firefoxBody', bold) : t('body')}
      </p>
    </section>
  );
}
