'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Building2, Landmark } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { ActionBar } from '@/components/app-shell/action-bar';
import { useBrokerProfile } from '@/components/use-broker-profile';
import { applyOverrides } from '@/src/brokers/overrides';
import { brokers, scheduleFor } from '@/src/brokers/registry';
import type { BrokerDef, FeeSchedule, TradeFee } from '@/src/brokers/types';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The first-run gate: kind → institution → review the resolved rates. No
 * back arrow on the first step — a gate has nowhere to go back to — but
 * "I'll set this later" is a real answer, recorded so the question is never
 * asked again. Reached again from Settings, the same flow is the editor:
 * one component writing one state from both places.
 */
type Step = { name: 'kind' } | { name: 'broker'; kind: BrokerDef['kind'] } | { name: 'review'; brokerId: string };

const sym = (currency: string) => ({ ILS: '₪', USD: '$' })[currency] ?? `${currency} `;
const pctLabel = (pct: number, locale: string) => `${fmtNum(Number((pct * 100).toFixed(3)), locale, 0)}%`;

export function OnboardingScreen() {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const router = useRouter();
  const { state, save } = useBrokerProfile();
  const [step, setStep] = useState<Step>({ name: 'kind' });
  const [busy, setBusy] = useState(false);

  // Reached from Settings after answering, the flow is an editor and may go
  // back; as the first-run gate it may not.
  const editing = state.status === 'data';

  const finish = async (brokerId: string | null) => {
    setBusy(true);
    const wasEditing = editing;
    if (await save({ brokerId })) {
      if (wasEditing) router.push('/settings');
      else router.replace('/');
    } else {
      setBusy(false);
    }
  };

  const name = (b: BrokerDef) => (locale === 'he' ? b.nameHe : b.name);
  const all = Object.values(brokers);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-28">
      <div className="flex items-center gap-4 p-6">
        {(step.name !== 'kind' || editing) && (
          <button
            type="button"
            aria-label={t('back')}
            onClick={() => {
              if (step.name === 'review') setStep({ name: 'broker', kind: brokers[step.brokerId].kind });
              else if (step.name === 'broker') setStep({ name: 'kind' });
              else router.push('/settings');
            }}
          >
            <ArrowLeft className="size-6 text-foreground rtl:-scale-x-100" aria-hidden />
          </button>
        )}
        <h1 className="flex-1 text-base font-semibold text-foreground">
          {step.name === 'kind' && t('title')}
          {step.name === 'broker' && (step.kind === 'bank' ? t('chooseBank') : t('chooseHouse'))}
          {step.name === 'review' && name(brokers[step.brokerId])}
        </h1>
      </div>

      {step.name === 'kind' && (
        <div className="flex flex-col gap-4 px-6">
          <p className="text-base text-muted-foreground">{t('subtitle')}</p>
          {(
            [
              { kind: 'investment_house', icon: Building2, label: t('kindHouse'), hint: t('kindHouseHint') },
              { kind: 'bank', icon: Landmark, label: t('kindBank'), hint: t('kindBankHint') },
            ] as const
          ).map(({ kind, icon: Icon, label, hint }) => (
            <button
              key={kind}
              type="button"
              onClick={() => setStep({ name: 'broker', kind })}
              className="flex items-center gap-4 rounded-xl bg-card p-4 text-start"
            >
              <Icon className="size-6 shrink-0 text-primary" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish(null)}
            className="self-start pt-2 text-sm text-primary underline underline-offset-4 disabled:opacity-50"
          >
            {t('skip')}
          </button>
        </div>
      )}

      {step.name === 'broker' && (
        <ul className="mx-4 rounded-xl bg-card px-4 py-1">
          {all
            .filter((b) => b.kind === step.kind)
            .map((b, i) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setStep({ name: 'review', brokerId: b.id })}
                  className={cn('flex w-full items-center py-3 text-start', i > 0 && 'border-t border-border')}
                >
                  <span className="flex-1 text-base text-foreground">{name(b)}</span>
                </button>
              </li>
            ))}
        </ul>
      )}

      {step.name === 'review' && (
        <ReviewStep
          broker={brokers[step.brokerId]}
          // Editing the broker you already have keeps your negotiated
          // overrides visible; a different pick starts from the catalogue.
          overrides={editing && state.profile.brokerId === step.brokerId ? state.profile.overrides : null}
          busy={busy}
          onSave={() => void finish(step.brokerId)}
        />
      )}
    </main>
  );
}

function tradeFeeLabel(fee: TradeFee, locale: string, t: ReturnType<typeof useTranslations<'onboarding'>>): string {
  switch (fee.type) {
    case 'pct': {
      const rate = pctLabel(fee.pct, locale);
      return fee.min !== undefined ? `${rate} · ${t('min', { amount: `${sym(fee.currency)}${fmtNum(fee.min, locale)}` })}` : rate;
    }
    case 'per_share': {
      const rate = t('perShare', { amount: `${sym(fee.currency)}${fmtNum(fee.perShare, locale)}` });
      return fee.min !== undefined ? `${rate} · ${t('min', { amount: `${sym(fee.currency)}${fmtNum(fee.min, locale)}` })}` : rate;
    }
    case 'tiered_pct': {
      const first = fee.tiers[0];
      const last = fee.tiers[fee.tiers.length - 1];
      const range = first === last ? pctLabel(first.pct, locale) : `${pctLabel(first.pct, locale)}–${pctLabel(last.pct, locale)}`;
      return `${range} · ${t('byValue')}`;
    }
  }
}

function ReviewStep({
  broker,
  overrides,
  busy,
  onSave,
}: {
  broker: BrokerDef;
  overrides: Parameters<typeof applyOverrides>[1];
  busy: boolean;
  onSave: () => void;
}) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const s: FeeSchedule = applyOverrides(scheduleFor(broker, today), overrides);

  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (s.taseTrade) rows.push({ key: 'tase', label: t('taseTrade'), value: tradeFeeLabel(s.taseTrade, locale, t) });
  if (s.usTrade) {
    let value = tradeFeeLabel(s.usTrade, locale, t);
    if (s.usTradePassthrough) {
      value += ` + ${t('perShare', { amount: `${sym(s.usTradePassthrough.currency)}${fmtNum(s.usTradePassthrough.perShare, locale)}` })}`;
    }
    rows.push({ key: 'us', label: t('usTrade'), value });
  }
  if (s.accountFee) {
    rows.push({
      key: 'account',
      label: t('accountFee'),
      value:
        t('perMonth', { amount: `${sym(s.accountFee.currency)}${fmtNum(s.accountFee.monthly, locale, 0)}` }) +
        (s.accountFee.offsetAgainstCommissions ? ` · ${t('offsetNote')}` : ''),
    });
  }
  if (s.custodyFee) {
    const tiers = s.custodyFee.annual.tiers;
    const range =
      tiers.length > 1
        ? `${pctLabel(tiers[0].pct, locale)}–${pctLabel(tiers[tiers.length - 1].pct, locale)}`
        : pctLabel(tiers[0].pct, locale);
    rows.push({
      key: 'custody',
      label: t('custodyFee'),
      value: `${t('perYear', { rate: range })} · ${t('billedQuarterly')}`,
    });
  }
  if (s.fxFeePct !== undefined) {
    rows.push({ key: 'fx', label: t('fxFee'), value: pctLabel(s.fxFeePct, locale) });
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-6">
        <p className="text-base text-muted-foreground">{t('reviewHint')}</p>
        <div className="rounded-xl bg-card px-4 py-1">
          {rows.map((r, i) => (
            <div key={r.key} className={cn('flex flex-col gap-0.5 py-3', i > 0 && 'border-t border-border')}>
              <span className="text-xs text-muted-foreground">{r.label}</span>
              <span className="text-base text-foreground" dir="ltr">
                {r.value}
              </span>
            </div>
          ))}
        </div>
        {broker.kind === 'bank' && <p className="text-xs text-muted-foreground">{t('bankSoftNote')}</p>}
      </div>
      <ActionBar label={t('save')} disabled={busy} onClick={onSave} />
    </>
  );
}
