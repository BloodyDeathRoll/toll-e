import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { brokerProfiles } from '@/src/db/schema';
import { applyOverrides } from '@/src/brokers/overrides';
import { getBroker, scheduleFor } from '@/src/brokers/registry';
import type { FeeOverrides, FeeSchedule } from '@/src/brokers/types';

export type BrokerProfileRow = typeof brokerProfiles.$inferSelect;

export async function getBrokerProfile(userId: string): Promise<BrokerProfileRow | null> {
  const [p] = await db.select().from(brokerProfiles).where(eq(brokerProfiles.userId, userId));
  return p ?? null;
}

export interface BrokerProfilePatch {
  /** Registry id, or null for "I'll set this later" — a real answer. */
  brokerId?: string | null;
  tierId?: string | null;
  overrides?: FeeOverrides | null;
  accountFeeWaivedUntil?: string | null;
}

/**
 * Create or update the user's single broker profile. Undefined keys are left
 * alone (drizzle drops them); null explicitly clears. `answeredAt` is set on
 * first insert only — it records that the question was answered at all, and
 * is what stops the onboarding re-prompt.
 */
export async function upsertBrokerProfile(userId: string, patch: BrokerProfilePatch): Promise<BrokerProfileRow> {
  const [row] = await db
    .insert(brokerProfiles)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: brokerProfiles.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/**
 * The fee schedule in force for this user on a date: registry schedule for
 * their broker with their sparse overrides merged on top — the same layered
 * precedence hoursFor uses (holiday → schedule → per-date override). Null
 * when no broker is set (including "later"): commissions default to 0.
 */
export function resolveSchedule(profile: BrokerProfileRow | null, isoDate: string): FeeSchedule | null {
  if (!profile?.brokerId) return null;
  const schedule = scheduleFor(getBroker(profile.brokerId), isoDate);
  return applyOverrides(schedule, profile.overrides);
}
