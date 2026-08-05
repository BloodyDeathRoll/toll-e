import { useTranslations } from 'next-intl';

// Placeholder — market strip lands in Phase 1.
export default function Page() {
  const t = useTranslations('nav');
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">{t('markets')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </main>
  );
}
