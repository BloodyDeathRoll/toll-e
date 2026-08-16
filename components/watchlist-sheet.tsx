'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useWatchlists, type WatchlistData } from '@/components/use-watchlists';
import { HOLDINGS_LIST, listInMarket } from '@/src/watchlists/constants';
import { marketForSymbol } from '@/src/markets/registry';
import { cn } from '@/lib/utils';

/**
 * "Include in watchlists" sheet (Figma "Stock click star"): starring a symbol
 * asks which lists it belongs to instead of silently dropping it in the first
 * one. Selection is multi-choice and only committed on Save.
 *
 * Holdings is listed when the symbol is in it, so the user can see why the
 * star is lit, but it is inert — that list mirrors the transactions and
 * cannot be edited by hand.
 *
 * Rendered through a portal: the callers sit inside stacking contexts of
 * their own (the search overlay is z-40), and a nested z-50 loses to the
 * bottom nav next to it — which is exactly the Save button the sheet needs.
 */
export function WatchlistSheet({
  symbol,
  lists,
  onClose,
}: {
  symbol: string;
  lists: WatchlistData[];
  onClose: () => void;
}) {
  const t = useTranslations('lists');
  const { createList, patchList, reload } = useWatchlists();
  // Watchlists are grouped per market: a TASE ticker only offers TASE lists,
  // and a list created here is born into the symbol's market.
  const marketId = marketForSymbol(symbol).id;
  const editable = lists.filter((l) => l.name !== HOLDINGS_LIST && listInMarket(l, marketId));
  const holdings = lists.find((l) => l.name === HOLDINGS_LIST && l.symbols.includes(symbol));
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(editable.filter((l) => l.symbols.includes(symbol)).map((l) => l.id)),
  );
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Portals need a DOM; render nothing on the server pass.
  const [mounted, setMounted] = useState(false);

  // Escape closes, and the page beneath must not scroll under the sheet.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only on the client
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    // Only touch lists whose membership actually changed.
    for (const l of editable) {
      const should = picked.has(l.id);
      const has = l.symbols.includes(symbol);
      if (should === has) continue;
      await patchList(l.id, {
        symbols: should ? [...l.symbols, symbol] : l.symbols.filter((s) => s !== symbol),
      });
    }
    if (creating && newName.trim()) {
      const created = await createList(newName.trim(), marketId);
      if (created) await patchList(created.id, { symbols: [symbol] });
    }
    await reload();
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="app-frame fixed inset-0 z-[60] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex max-h-[80vh] flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-background px-6 pt-6 pb-4">
        <h2 className="text-base font-medium text-foreground">{t('includeIn')}</h2>

        <div className="flex flex-col gap-3">
          {holdings && (
            <div
              aria-disabled
              className="flex items-center justify-between rounded-[20px] bg-primary/10 px-6 py-3.5 opacity-40"
            >
              <span className="text-base font-bold text-foreground">{holdings.name}</span>
              <Check className="size-5 text-primary" aria-hidden />
            </div>
          )}
          {editable.map((l) => {
            const on = picked.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                aria-pressed={on}
                className={cn(
                  'flex items-center justify-between rounded-[20px] px-6 py-3.5 text-start',
                  on ? 'bg-primary/10' : 'bg-card',
                )}
              >
                <span className="text-base font-bold text-foreground">{l.name}</span>
                {on && <Check className="size-5 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>

        {creating ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('listName')}
            className="h-[48px] rounded-[20px] border border-field bg-well px-6 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="self-start text-base font-medium text-brand"
          >
            + {t('emptyCta')}
          </button>
        )}

        {/* Save sits on the same bar as the tab bar and the ActionBar, in the
            same surface — one shape at the bottom of a screen. */}
        <div className="-mx-6 -mb-4 mt-2 flex flex-col items-center gap-1 bg-card-darker px-6 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            aria-label={t('save')}
            className="flex size-14 items-center justify-center rounded-full bg-primary disabled:opacity-50"
          >
            <Check className="size-6 text-primary-foreground" aria-hidden />
          </button>
          <span className="text-xs text-foreground">{t('save')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
