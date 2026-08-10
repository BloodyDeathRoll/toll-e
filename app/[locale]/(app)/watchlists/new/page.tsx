import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { WatchlistsScreen } from '../watchlists-screen';

/**
 * Creating a list is its own route, not a query param: the tab bar has to
 * know to hide itself here, and reading search params in that globally
 * mounted component opts every app page out of static generation.
 */
export default function NewWatchlistPage({ params }: PageProps<'/[locale]/watchlists/new'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <WatchlistsScreen initialMode="create" />;
}
