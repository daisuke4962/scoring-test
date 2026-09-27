import { useEffect, useState } from 'react';
import type { Dict } from './i18n';

type Sections = Dict['help']['instructor'];

/**
 * The "How to use" button and the sheet it opens. Each screen passes the sections that concern it,
 * so the phone does not show the instructor's half.
 */
export function Help({ t, sections }: { t: Dict; sections: Sections }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="icon-btn" onClick={() => setOpen(true)}>{t.help.btn}</button>
      {open && (
        // Clicking the backdrop closes it; clicking the sheet itself must not.
        <div className="sheet-back" onClick={() => setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={t.help.title} onClick={e => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>{t.help.title}</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t.close}>×</button>
            </div>
            {sections.map(s => (
              <section key={s.h}>
                <h3>{s.h}</h3>
                <ul>{s.lines.map(line => <li key={line}>{line}</li>)}</ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
