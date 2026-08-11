import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { WatchlistsScreen } from '../../watchlists-screen';

/** "Add tickers": the edit screen with its ticker search already open. */
export default function AddTickersPage({ params }: PageProps<'/[locale]/watchlists/[id]/add'>) {
  const { locale, id } = use(params);
  setRequestLocale(locale);
  return <WatchlistsScreen initialMode="add" listId={id} />;
}
