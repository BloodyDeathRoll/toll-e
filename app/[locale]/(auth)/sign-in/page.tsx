import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AuthForm } from '../auth-form';

export default function SignInPage({ params }: PageProps<'/[locale]/sign-in'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <AuthForm mode="signIn" />;
}
