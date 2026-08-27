'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { calendarForSymbol, getMarket } from '@/src/markets/registry';
import { getSessionState, type SessionPhase } from '@/src/markets/calendar';

export interface MarketSession {
  phase: SessionPhase;
  /** Localized status line, e.g. "US markets pre-market · opens 9:30 AM EDT". */
  text: string;
}

const phaseMessage: Record<SessionPhase, string> = {
  pre: 'preOpens',
  open: 'openCloses',
  post: 'postEnds',
  closed: 'closedOpens',
};

/**
 * Live session phase + localized status line for a market. Depends on the
 * client clock, so it resolves after mount (null during SSR) and refreshes.
 *
 * Pass `symbol` on a page about one instrument. A future is attributed to the
 * market whose basket it tracks but keeps its own near-24h hours, so asking
 * the market would badge a contract trading at 3 a.m. as "closed".
 */
export function useMarketSession(marketId: string, symbol?: string): MarketSession | null {
  const t = useTranslations('market');
  const locale = useLocale();
  const [session, setSession] = useState<MarketSession | null>(null);

  useEffect(() => {
    const cal = symbol ? calendarForSymbol(symbol) : getMarket(marketId).calendar;
    const update = () => {
      const state = getSessionState(cal, new Date());
      if (state.minutesToChange === undefined) {
        setSession(null);
        return;
      }
      const at = new Date(Date.now() + state.minutesToChange * 60_000);
      const time = new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: cal.timezone,
        ...(locale === 'en' ? { timeZoneName: 'short' } : {}),
      }).format(at);
      setSession({
        phase: state.phase,
        text: t(phaseMessage[state.phase], { market: t(`stripName.${marketId}`), time }),
      });
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [marketId, symbol, locale, t]);

  return session;
}
