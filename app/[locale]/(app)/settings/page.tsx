import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { SettingsScreen } from './settings-screen';

export default function SettingsPage({ params }: PageProps<'/[locale]/settings'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <SettingsScreen />;
}
