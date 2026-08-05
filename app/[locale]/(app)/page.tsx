import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { HomeScreen } from './home-screen';

export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <HomeScreen />;
}
