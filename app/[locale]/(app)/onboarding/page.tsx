import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { OnboardingScreen } from './onboarding-screen';

/**
 * The broker question, as its own route inside (app) so it inherits the
 * shell: OnboardingGuard redirects here while the question is unanswered,
 * and Settings links here to change the answer later.
 */
export default function OnboardingPage({ params }: PageProps<'/[locale]/onboarding'>) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <OnboardingScreen />;
}
