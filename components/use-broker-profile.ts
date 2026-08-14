'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FeeOverrides } from '@/src/brokers/types';

export interface BrokerProfileData {
  /** Registry id, or null = answered "I'll set this later". */
  brokerId: string | null;
  tierId: string | null;
  overrides: FeeOverrides | null;
  accountFeeWaivedUntil: string | null;
  /** When the brokerage account was opened — starts the monthly-fee clock. */
  accountOpenedAt: string | null;
}

/**
 * 'unset' is a first-class state, distinct from 'data' with a null brokerId:
 * the first means the question was never answered and the onboarding gate
 * must show; the second means the user said "later" and must never be
 * re-prompted.
 */
export type BrokerProfileState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  // Distinct from 'signed-out' — see the note in use-portfolio.ts. The gate
  // must not read a failing endpoint as "never answered".
  | { status: 'error' }
  // `firstTradeDate` rides on both answered states because it is what the
  // account-opening date defaults to, and the user who most needs that
  // default — someone with a history but no broker set — is in 'unset'.
  | { status: 'unset'; firstTradeDate: string | null }
  | { status: 'data'; profile: BrokerProfileData; firstTradeDate: string | null };

export function useBrokerProfile() {
  const [state, setState] = useState<BrokerProfileState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/broker-profile');
      if (res.status === 401) {
        setState({ status: 'signed-out' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const firstTradeDate = json.firstTradeDate ?? null;
      setState(
        json.profile
          ? { status: 'data', profile: json.profile, firstTradeDate }
          : { status: 'unset', firstTradeDate },
      );
    } catch {
      setState((s) => (s.status === 'loading' ? { status: 'error' } : s));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount
    reload();
  }, [reload]);

  // No optimistic updates: the answer gates onboarding, and a rollback there
  // would flash the gate.
  const save = async (patch: Partial<BrokerProfileData>): Promise<boolean> => {
    const res = await fetch('/api/broker-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return false;
    await reload();
    return true;
  };

  return { state, reload, save };
}
