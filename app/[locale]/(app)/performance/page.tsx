import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PerformanceScreen } from './performance-screen';

export default function PerformancePage({ params }: PageProps<'/[locale]/performance'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <PerformanceScreen />;
}
