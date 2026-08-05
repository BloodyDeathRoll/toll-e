import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { TaxScreen } from './tax-screen';

export default function TaxPage({ params }: PageProps<'/[locale]/tax'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <TaxScreen />;
}
