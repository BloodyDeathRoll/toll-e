import { redirect } from 'next/navigation';

// Signing up and signing in are the same Google action — keep the old route
// working for existing links rather than 404ing it.
export default async function SignUpPage({ params }: PageProps<'/[locale]/sign-up'>) {
  const { locale } = await params;
  redirect(`/${locale}/sign-in`);
}
