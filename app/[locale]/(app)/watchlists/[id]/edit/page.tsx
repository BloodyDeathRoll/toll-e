import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { WatchlistsScreen } from '../../watchlists-screen';

/**
 * Editing a list is its own route so the home screen's list menu can open it
 * directly. Same reasoning as /watchlists/new: a route, not a query param,
 * which would opt every app page out of static generation.
 */
export default function EditWatchlistPage({ params }: PageProps<'/[locale]/watchlists/[id]/edit'>) {
  const { locale, id } = use(params);
  setRequestLocale(locale);
  return <WatchlistsScreen initialMode="edit" listId={id} />;
}
