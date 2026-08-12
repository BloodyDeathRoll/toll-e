import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { TransactionsScreen } from './transactions-screen';

export default function TransactionsPage({ params }: PageProps<'/[locale]/transactions'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <TransactionsScreen />;
}
