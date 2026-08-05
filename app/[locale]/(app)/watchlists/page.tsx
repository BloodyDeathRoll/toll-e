import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { WatchlistsScreen } from './watchlists-screen';

export default function WatchlistsPage({ params }: PageProps<'/[locale]/watchlists'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <WatchlistsScreen />;
}
