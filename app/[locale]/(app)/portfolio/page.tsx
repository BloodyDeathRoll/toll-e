import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PortfolioScreen } from './portfolio-screen';

export default function PortfolioPage({ params }: PageProps<'/[locale]/portfolio'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <PortfolioScreen />;
}
