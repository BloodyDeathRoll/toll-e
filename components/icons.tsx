import { cn } from '@/lib/utils';

/**
 * The active Home tab icon, exported from Figma (Components/bottomNav →
 * icon/home). It is one filled shape with the doorway subtracted out — the
 * detail lucide's filled House loses, which made the tab read as a solid
 * blob in production.
 */
export function HouseFilled({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('size-6', className)}
    >
      <path
        d="M21 9V20C21 20.5304 20.7891 21.039 20.4141 21.4141C20.039 21.7891 19.5304 22 19 22H15V13.5H9V22H5C4.46958 22 3.961 21.7891 3.58594 21.4141C3.21088 21.039 3 20.5304 3 20V9L12 2L21 9Z"
        fill="currentColor"
      />
    </svg>
  );
}
