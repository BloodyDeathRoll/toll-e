'use client';

import { useTranslations } from 'next-intl';
import { useMarketSession } from '@/components/app-shell/use-market-session';
import type { SessionPhase } from '@/src/markets/calendar';
import { cn } from '@/lib/utils';

// Phase → dot color: green pulse while live, yellow for extended sessions,
// gray when closed. Always paired with a text label — never color alone.
const dotClass: Record<SessionPhase, string> = {
  open: 'bg-gain animate-pulse',
  pre: 'bg-primary',
  post: 'bg-primary',
  closed: 'bg-faint',
};

function Dot({ phase }: { phase: SessionPhase }) {
  return <span className={cn('size-1.5 shrink-0 rounded-full', dotClass[phase])} aria-hidden />;
}

/** Full status line with dot: "● US markets open · closes 4:00 PM EDT". */
export function SessionStatus({ marketId, className }: { marketId: string; className?: string }) {
  const session = useMarketSession(marketId);
  if (!session) return null;
  return (
    <span className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <Dot phase={session.phase} />
      {session.text}
    </span>
  );
}

/** Compact chip for quote headers: "● Pre-market" / "● Live" / "● At close". */
export function SessionBadge({ marketId, className }: { marketId: string; className?: string }) {
  const t = useTranslations('market');
  const session = useMarketSession(marketId);
  if (!session) return null;
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium',
        session.phase === 'open' ? 'text-gain' : 'text-muted-foreground',
        className,
      )}
    >
      <Dot phase={session.phase} />
      {t(`phaseBadge.${session.phase}`)}
    </span>
  );
}
