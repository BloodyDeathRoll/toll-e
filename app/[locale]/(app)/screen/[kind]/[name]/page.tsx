import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { use } from 'react';
import { ScreenView } from '../../screen-view';

/**
 * The leading names in one classification — where a sector or industry tag on
 * a stock page lands. A route rather than a query param, like every other
 * flow here, so the app pages stay statically generable.
 */
export default function ScreenPage({ params }: PageProps<'/[locale]/screen/[kind]/[name]'>) {
  const { locale, kind, name } = use(params);
  setRequestLocale(locale);
  if (kind !== 'sector' && kind !== 'industry') notFound();
  return <ScreenView kind={kind} name={decodeURIComponent(name)} />;
}
