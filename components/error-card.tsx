'use client';

import { useTranslations } from 'next-intl';

/**
 * What a screen shows when a request fails for any reason other than 401.
 *
 * It exists because the alternative was worse than useless: every loader
 * used to fold failures into 'signed-out', so a 500 put the Google sign-in
 * wall in front of a user whose session was perfectly valid — and signing in
 * again fixed nothing, because nothing was wrong with the session. A server
 * error has to say so, and offer the one action that can help.
 */
export function ErrorCard({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations('common');
  return (
    <section
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6"
    >
      <p className="text-sm text-muted-foreground">{t('error')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          {t('retry')}
        </button>
      )}
    </section>
  );
}
