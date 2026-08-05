import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">{t('app.name')}</h1>
      <p className="text-muted-foreground">{t('app.tagline')}</p>
      <LocaleSwitcher />
    </main>
  );
}
