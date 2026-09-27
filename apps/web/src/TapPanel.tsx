import { useRef } from 'react';
import type { Side, TapValue } from '@scoring-test/shared';
import type { Dict } from './i18n';

/** Brief pressed look, for touch and keyboard alike. */
export function flash(el: Element | null | undefined) {
  if (!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 110);
}

const VALUES: TapValue[] = [1, 2, 3, 'gj', 'undo'];

/**
 * The five buttons a judge has for one athlete. Fires on pointer-down, not click, so a press
 * counts the instant the finger lands. Enter or Space on a focused button also works.
 */
export function TapPanel({ side, t, disabled, onTap, keys }: {
  side: Side;
  t: Dict;
  disabled?: boolean;
  onTap: (side: Side, value: TapValue, el: HTMLButtonElement) => void;
  keys?: Partial<Record<string, string>>;   // keyboard hint shown under each label
}) {
  // A press by finger fires pointerdown and then a click whose `detail` is 0, exactly like a press
  // by keyboard. Without this, one tap on a touch screen would count twice.
  const lastPointerDown = useRef(0);

  return (
    <div className={'panel ' + side}>
      {VALUES.map(v => {
        const cls = v === 'gj' ? 'gj' : v === 'undo' ? 'undo' : 'pt';
        const label = v === 'gj' ? t.gamjeom : v === 'undo' ? t.undo : String(v);
        const key = keys?.[String(v)];
        return (
          <button
            key={String(v)} className={cls} data-side={side} data-val={String(v)} disabled={disabled}
            onPointerDown={e => { e.preventDefault(); lastPointerDown.current = e.timeStamp; onTap(side, v, e.currentTarget); }}
            onClick={e => { if (e.detail === 0 && e.timeStamp - lastPointerDown.current > 700) onTap(side, v, e.currentTarget); }}
          >
            {label}
            {key && <span className="key">{key}</span>}
          </button>
        );
      })}
    </div>
  );
}
