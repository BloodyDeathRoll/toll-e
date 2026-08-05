import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { JournalScreen } from './journal-screen';

export default function TransactionsPage({ params }: PageProps<'/[locale]/transactions'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <JournalScreen />;
}
