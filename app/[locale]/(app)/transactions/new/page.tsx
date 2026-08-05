import { setRequestLocale } from 'next-intl/server';
import { Suspense, use } from 'react';
import { TxScreen } from './tx-screen';

export default function NewTransactionPage({
  params,
}: PageProps<'/[locale]/transactions/new'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    // Suspense boundary required around useSearchParams during prerender.
    <Suspense>
      <TxScreen />
    </Suspense>
  );
}
