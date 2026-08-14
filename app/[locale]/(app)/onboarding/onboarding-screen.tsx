'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Building2, CalendarDays, ChevronDown, ChevronUp, Landmark } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { ActionBar } from '@/components/app-shell/action-bar';
import { LocalePicker } from '@/components/locale-picker';
import { useBrokerProfile } from '@/components/use-broker-profile';
import { applyOverrides } from '@/src/brokers/overrides';
import { brokers, scheduleFor } from '@/src/brokers/registry';
import type { BrokerDef, FeeOverrides, FeeSchedule, TradeFee, TradeFeeOverride } from '@/src/brokers/types';
import { fmtNum, fmtRatePct } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The first-run gate: kind → institution → review the resolved rates. No
 * back arrow on the first step — a gate has nowhere to go back to — but
 * "I'll set this later" is a real answer, recorded so the question is never
 * asked again. Reached again from Settings, the same flow is the editor:
 * one component writing one state from both places.
 *
 * The review step carries a per-field "Custom" editor writing sparse
 * FeeOverrides: negotiated rates are the norm at banks, and a user who
 * knows their number should be able to set it here — before saving, and
 * again any time after via Settings, since both paths land on this screen.
 */
type Step = { name: 'kind' } | { name: 'broker'; kind: BrokerDef['kind'] } | { name: 'review'; brokerId: string };

const sym = (currency: string) => ({ ILS: '₪', USD: '$' })[currency] ?? `${currency} `;
const pctLabel = fmtRatePct;

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

  const finish = async (brokerId: string | null, overrides?: FeeOverrides, accountOpenedAt?: string) => {
    setBusy(true);
    const wasEditing = editing;
    const patch =
      brokerId === null
        ? { brokerId }
        : // Empty overrides clear explicitly: re-saving after deleting your
          // customisations must not leave the old ones behind.
          {
            brokerId,
            overrides: overrides && Object.keys(overrides).length ? overrides : null,
            accountOpenedAt: accountOpenedAt ?? null,
          };
    if (await save(patch)) {
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
        {/* The gate greets users before Settings is reachable, so the
            language choice has to live here too. */}
        {step.name === 'kind' && <LocalePicker />}
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
          key={step.brokerId}
          broker={brokers[step.brokerId]}
          // Editing the broker you already have starts from your negotiated
          // overrides; a different pick starts from the catalogue.
          initialOverrides={
            editing && state.profile.brokerId === step.brokerId ? (state.profile.overrides ?? null) : null
          }
          initialOpenedAt={editing ? state.profile.accountOpenedAt : null}
          busy={busy}
          onSave={(overrides, openedAt) => void finish(step.brokerId, overrides, openedAt)}
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
      // One tier — a user's collapsed custom rate, or FIBI's flat figure —
      // is not "by portfolio value" any more; read it like a plain pct fee.
      if (first === last) {
        const rate = pctLabel(first.pct, locale);
        return first.min !== undefined
          ? `${rate} · ${t('min', { amount: `${sym(fee.currency)}${fmtNum(first.min, locale)}` })}`
          : rate;
      }
      return `${pctLabel(first.pct, locale)}–${pctLabel(last.pct, locale)} · ${t('byValue')}`;
    }
  }
}

/** Number inputs give NaN for an empty field; a fee of nothing is 0. */
const num = (v: number) => (Number.isNaN(v) ? 0 : v);

function ReviewStep({
  broker,
  initialOverrides,
  initialOpenedAt,
  busy,
  onSave,
}: {
  broker: BrokerDef;
  initialOverrides: FeeOverrides | null;
  initialOpenedAt: string | null;
  busy: boolean;
  onSave: (overrides: FeeOverrides, accountOpenedAt: string) => void;
}) {
  const t = useTranslations('onboarding');
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const base = scheduleFor(broker, today);
  const [overrides, setOverrides] = useState<FeeOverrides>(initialOverrides ?? {});
  // Today by default — no history invented. Backdated, every ended month
  // since then is billed its fee, whether or not anything traded in it.
  const [openedAt, setOpenedAt] = useState(initialOpenedAt ?? today);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The rows always render the *merged* schedule, so a custom number is
  // reflected the moment it is typed — before anything is saved.
  const s: FeeSchedule = applyOverrides(base, overrides);

  const clear = (key: keyof FeeOverrides) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });

  /**
   * A negotiated trade rate replaces whatever shape the catalogue has: a pct
   * fee keeps its type, and a bank's tier table collapses to the one flat
   * tier the user actually pays — which is what "I know my rate" means.
   */
  const setTrade = (key: 'taseTrade' | 'usTrade', patch: { rate?: number; min?: number }) => {
    const fee = base[key];
    if (!fee) return;
    setOverrides((o) => {
      const cur: TradeFeeOverride = { ...(o[key] ?? {}) };
      if (fee.type === 'per_share') {
        if (patch.rate !== undefined) cur.perShare = num(patch.rate);
        if (patch.min !== undefined) cur.min = num(patch.min);
      } else if (fee.type === 'pct') {
        if (patch.rate !== undefined) cur.pct = num(patch.rate) / 100;
        if (patch.min !== undefined) cur.min = num(patch.min);
      } else {
        const prev = cur.tiers?.[0];
        cur.tiers = [
          {
            id: 'custom',
            pct: patch.rate !== undefined ? num(patch.rate) / 100 : (prev?.pct ?? fee.tiers[0].pct),
            min: patch.min !== undefined ? num(patch.min) : (prev?.min ?? fee.tiers[0].min),
          },
        ];
      }
      return { ...o, [key]: cur };
    });
  };

  // Uncontrolled on purpose: a controlled number input clobbers a half-typed
  // decimal ("0." parses to NaN and the render wipes it). The editor mounts
  // fresh each time it opens, so defaultValue is the current effective
  // figure, and only valid parses commit to the overrides — whose effect is
  // visible live in the row's value line above. The chevrons are the
  // transaction stepper's, native spinner hidden the same way; being
  // uncontrolled, they write the input element directly before committing.
  const input = (label: string, value: number | undefined, onChange: (n: number) => void, step = 0.01) => {
    const bump = (e: React.MouseEvent<HTMLButtonElement>, delta: number) => {
      const field = e.currentTarget.closest('label')?.querySelector('input');
      if (!field) return;
      const current = Number(field.value);
      const next = Math.max(0, Number(((Number.isNaN(current) ? 0 : current) + delta).toFixed(4)));
      field.value = String(next);
      onChange(next);
    };
    return (
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="flex h-[40px] items-center gap-2 rounded-[14px] border border-field bg-well px-3">
          <input
            dir="ltr"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            defaultValue={value ?? ''}
            aria-label={label}
            onChange={(e) => {
              if (!Number.isNaN(e.target.valueAsNumber)) onChange(e.target.valueAsNumber);
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label={`${label} +`} onClick={(e) => bump(e, step)}>
              <ChevronUp className="size-4 text-foreground" aria-hidden />
            </button>
            <button type="button" aria-label={`${label} -`} onClick={(e) => bump(e, -step)}>
              <ChevronDown className="size-4 text-foreground" aria-hidden />
            </button>
          </span>
        </div>
      </label>
    );
  };

  /** The current effective (post-override) numbers, prefilling the editor. */
  const tradeEff = (fee: TradeFee) =>
    fee.type === 'pct'
      ? { rate: fee.pct * 100, min: fee.min }
      : fee.type === 'per_share'
        ? { rate: fee.perShare, min: fee.min }
        : { rate: fee.tiers[0].pct * 100, min: fee.tiers[0].min };

  const feeRow = (
    key: string,
    label: string,
    value: string,
    editor: React.ReactNode | null,
    onClear: (() => void) | null,
    i: number,
  ) => (
    <div key={key} className={cn('flex flex-col gap-0.5 py-3', i > 0 && 'border-t border-border')}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        {editor && (
          <button
            type="button"
            onClick={() =>
              setOpen((v) => {
                if (v[key] && onClear) onClear();
                return { ...v, [key]: !v[key] };
              })
            }
            className="text-xs text-primary underline underline-offset-2"
          >
            {open[key] ? t('reset') : t('custom')}
          </button>
        )}
      </span>
      <span className="text-base text-foreground" dir="ltr">
        {value}
      </span>
      {editor && open[key] && <div className="flex gap-3 pt-2">{editor}</div>}
    </div>
  );

  const rows: React.ReactNode[] = [];
  let i = 0;
  for (const key of ['taseTrade', 'usTrade'] as const) {
    const fee = s[key];
    if (!fee) continue;
    const eff = tradeEff(fee);
    let value = tradeFeeLabel(fee, locale, t);
    if (key === 'usTrade' && s.usTradePassthrough) {
      value += ` + ${t('perShare', { amount: `${sym(s.usTradePassthrough.currency)}${fmtNum(s.usTradePassthrough.perShare, locale)}` })}`;
    }
    rows.push(
      feeRow(
        key,
        key === 'taseTrade' ? t('taseTrade') : t('usTrade'),
        value,
        <>
          {input(fee.type === 'per_share' ? t('perShareFee') : t('ratePct'), eff.rate, (n) => setTrade(key, { rate: n }))}
          {input(t('minFee'), eff.min, (n) => setTrade(key, { min: n }), 0.1)}
        </>,
        () => clear(key),
        i++,
      ),
    );
  }
  if (s.accountFee) {
    rows.push(
      feeRow(
        'account',
        t('accountFee'),
        t('perMonth', { amount: `${sym(s.accountFee.currency)}${fmtNum(s.accountFee.monthly, locale, 0)}` }) +
          (s.accountFee.offsetAgainstCommissions ? ` · ${t('offsetNote')}` : ''),
        input(
          t('monthlyAmount'),
          s.accountFee.monthly,
          (n) => setOverrides((o) => ({ ...o, accountFee: { ...o.accountFee, monthly: num(n) } })),
          1,
        ),
        () => clear('accountFee'),
        i++,
      ),
    );
  }
  if (s.custodyFee) {
    const tiers = s.custodyFee.annual.tiers;
    const range =
      tiers.length > 1
        ? `${pctLabel(tiers[0].pct, locale)}–${pctLabel(tiers[tiers.length - 1].pct, locale)}`
        : pctLabel(tiers[0].pct, locale);
    rows.push(
      feeRow(
        'custody',
        t('custodyFee'),
        `${t('perYear', { rate: range })} · ${t('billedQuarterly')}`,
        input(t('annualPct'), tiers[0].pct * 100, (n) =>
          setOverrides((o) => ({
            ...o,
            custodyFee: { ...o.custodyFee, annual: { tiers: [{ id: 'custom', pct: num(n) / 100 }] } },
          })),
        ),
        () => clear('custodyFee'),
        i++,
      ),
    );
  }
  if (s.fxFeePct !== undefined) {
    rows.push(
      feeRow(
        'fx',
        t('fxFee'),
        pctLabel(s.fxFeePct, locale),
        input(t('ratePct'), s.fxFeePct * 100, (n) => setOverrides((o) => ({ ...o, fxFeePct: num(n) / 100 }))),
        () => clear('fxFeePct'),
        i++,
      ),
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-6">
        <p className="text-base text-muted-foreground">{t('reviewHint')}</p>
        <div className="rounded-xl bg-card px-4 py-1">{rows}</div>
        {(s.accountFee || s.custodyFee) && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">{t('accountCreation')}</span>
            <div className="flex h-[48px] items-center gap-4 rounded-[20px] border border-field bg-well px-4">
              <CalendarDays className="size-4 shrink-0 text-foreground" aria-hidden />
              <input
                dir="ltr"
                type="date"
                value={openedAt}
                max={today}
                onChange={(e) => e.target.value && setOpenedAt(e.target.value)}
                aria-label={t('accountCreation')}
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-foreground outline-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('accountCreationHint')}</p>
          </div>
        )}
        {broker.kind === 'bank' && <p className="text-xs text-muted-foreground">{t('bankSoftNote')}</p>}
      </div>
      <ActionBar label={t('save')} disabled={busy} onClick={() => onSave(overrides, openedAt)} />
    </>
  );
}
