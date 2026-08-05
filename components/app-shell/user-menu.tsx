'use client';

import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/src/i18n/navigation';
import { signOut, useSession } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const t = useTranslations('auth');
  const tn = useTranslations('nav');
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) return <span className="size-[30px] rounded-full bg-secondary" aria-hidden />;

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-accent"
      >
        {t('signIn')}
      </Link>
    );
  }

  const initials = session.user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-[30px] items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground outline-none">
        {initials || '?'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-xl">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{session.user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{session.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/performance')}>
          {tn('performance')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          {tn('settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push('/');
            router.refresh();
          }}
        >
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
