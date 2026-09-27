import { LANG_NAMES, type Lang } from './i18n';

/** Language picker. A select rather than a toggle so a third language needs no UI change. */
export function LangSelect({ lang, setLang, label }: { lang: Lang; setLang: (l: Lang) => void; label: string }) {
  return (
    <select className="lang" aria-label={label} value={lang} onChange={e => setLang(e.target.value as Lang)}>
      {(Object.keys(LANG_NAMES) as Lang[]).map(l => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
    </select>
  );
}
