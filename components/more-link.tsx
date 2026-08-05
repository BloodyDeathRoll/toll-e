import { ArrowRight } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { cn } from '@/lib/utils';

/** Yellow "label →" affordance from the design; arrow mirrors under RTL. */
export function MoreLink({
  href,
  children,
  className,
}: {
  href: Parameters<typeof Link>[0]['href'];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:opacity-80',
        className,
      )}
    >
      {children}
      <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}
