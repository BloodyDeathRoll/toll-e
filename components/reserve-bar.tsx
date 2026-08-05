/** Yellow progress bar: share of the tax reserve already held in cash. */
export function ReserveBar({ held, due }: { held: number; due: number }) {
  const pct = Math.min(100, Math.round((held / due) * 100));
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-secondary" dir="ltr">
      <div className="bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
