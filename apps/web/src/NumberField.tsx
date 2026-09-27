import { useEffect, useState } from 'react';

/**
 * A number input that commits on blur or Enter, not on every keystroke, so clearing the field to
 * type a new value does not send a zero. Out-of-range values are pulled back into range.
 */
export function NumberField({ value, min, max, step, label, onCommit }: {
  value: number; min: number; max: number; step: number; label: string; onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) { setDraft(String(value)); return; }
    const v = Math.min(max, Math.max(min, n));
    setDraft(String(v));
    if (v !== value) onCommit(v);
  }
  return (
    <input
      className="field sm" type="number" inputMode="decimal" aria-label={label}
      min={min} max={max} step={step} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
