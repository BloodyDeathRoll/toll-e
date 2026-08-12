import { redirect } from '@/src/i18n/navigation';

/**
 * Performance and the transaction journal are one screen now — two tabs of
 * /transactions, under a summary card that belongs to both. The route stays
 * so old links, bookmarks and the desktop nav land somewhere real.
 */
export default async function PerformancePage({ params }: PageProps<'/[locale]/performance'>) {
  const { locale } = await params;
  redirect({ href: '/transactions', locale });
}
