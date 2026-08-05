import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AuthForm } from '../auth-form';

export default function SignUpPage({ params }: PageProps<'/[locale]/sign-up'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <AuthForm mode="signUp" />;
}
