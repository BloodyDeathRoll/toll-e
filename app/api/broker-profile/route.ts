import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { brokerIds } from '@/src/brokers/registry';
import { getBrokerProfile, upsertBrokerProfile } from '@/src/server/broker-profile';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const profile = await getBrokerProfile(session.user.id);
  return NextResponse.json({
    profile: profile && {
      brokerId: profile.brokerId,
      tierId: profile.tierId,
      overrides: profile.overrides,
      accountFeeWaivedUntil: profile.accountFeeWaivedUntil,
    },
  });
}

const tierSchema = z.object({
  id: z.string().min(1),
  upTo: z.number().positive().optional(),
  pct: z.number().min(0),
  min: z.number().min(0).optional(),
});

const tradeFeeOverrideSchema = z
  .object({
    pct: z.number().min(0).optional(),
    perShare: z.number().min(0).optional(),
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
    tiers: z.array(tierSchema).min(1).optional(),
  })
  .strict();

const overridesSchema = z
  .object({
    taseTrade: tradeFeeOverrideSchema.optional(),
    usTrade: tradeFeeOverrideSchema.optional(),
    usTradePassthrough: z
      .object({ perShare: z.number().min(0).optional(), min: z.number().min(0).optional() })
      .strict()
      .optional(),
    accountFee: z
      .object({ monthly: z.number().min(0).optional(), offsetAgainstCommissions: z.boolean().optional() })
      .strict()
      .optional(),
    custodyFee: z
      .object({
        annual: z.object({ tiers: z.array(tierSchema).min(1).optional() }).strict().optional(),
        minPerPeriod: z.number().min(0).optional(),
        maxPerPeriod: z.number().min(0).optional(),
      })
      .strict()
      .optional(),
    fxFeePct: z.number().min(0).optional(),
  })
  .strict();

const putSchema = z.object({
  // null is a real answer ("I'll set this later") — it still writes a row,
  // which is what stops the onboarding re-prompt.
  brokerId: z
    .string()
    .nullable()
    .refine((id) => id === null || brokerIds.includes(id), 'unknown broker')
    .optional(),
  tierId: z.string().min(1).nullable().optional(),
  overrides: overridesSchema.nullable().optional(),
  accountFeeWaivedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = putSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  await upsertBrokerProfile(session.user.id, body.data);
  return NextResponse.json({ ok: true });
}
