'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';

interface Section {
  h: string;
  p: string[];
}

/** Shared shell for the Terms and Privacy documents (content lives in i18n). */
export function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const t = useTranslations(`legal.${doc}`);
  const tc = useTranslations('legal');
  const router = useRouter();
  const sections = t.raw('sections') as Section[];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-10">
      <div className="flex items-center gap-4 p-6">
        <button type="button" onClick={() => router.back()} aria-label={tc('back')}>
          <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
        </button>
        <h1 className="text-base font-medium text-foreground">{t('title')}</h1>
      </div>

      <div className="flex flex-col gap-6 px-6">
        <p className="text-xs text-muted-foreground">{tc('updated', { date: tc('updatedDate') })}</p>
        <p className="text-sm leading-relaxed text-foreground">{t('intro')}</p>

        {sections.map((s) => (
          <section key={s.h} className="flex flex-col gap-2">
            <h2 className="text-base font-bold text-foreground">{s.h}</h2>
            {s.p.map((para) => (
              <p key={para} className="text-sm leading-relaxed text-subtle">
                {para}
              </p>
            ))}
          </section>
        ))}

        <p className="rounded-lg bg-well p-4 text-xs leading-relaxed text-muted-foreground">
          {tc('contact')}
        </p>
      </div>
    </main>
  );
}
