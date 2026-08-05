import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { MarketsScreen } from './markets-screen';

export default function MarketsPage({ params }: PageProps<'/[locale]/markets'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <MarketsScreen />;
}
