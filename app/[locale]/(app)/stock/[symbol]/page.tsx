import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { StockScreen } from './stock-screen';

export default function StockPage({ params }: PageProps<'/[locale]/stock/[symbol]'>) {
  const { locale, symbol } = use(params);
  setRequestLocale(locale);
  return <StockScreen symbol={decodeURIComponent(symbol)} />;
}
