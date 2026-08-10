import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { LegalPage } from '@/components/legal-page';

export default function TermsPage({ params }: PageProps<'/[locale]/terms'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <LegalPage doc="terms" />;
}
