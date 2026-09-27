import { useEffect, useMemo, useRef, useState } from 'react';
import { buildQuestionSet, normalize, type JudgeSettings, type Mark, type Side, type Tap, type TapValue, type VideoInfo } from '@scoring-test/shared';
import { fmt, sideLabel, type Dict } from '../src/i18n';
import { TapPanel, flash } from '../src/TapPanel';
import { clock } from '../src/format';
import { NumberField } from '../src/NumberField';
import type { MarksEntry } from './types';

// Both hands on the home row, as if holding a scoring device in each.
const KEYMAP: Record<string, [Side, TapValue]> = {
  a: ['chung', 1], s: ['chung', 2], d: ['chung', 3], f: ['chung', 'gj'], q: ['chung', 'undo'],
  j: ['hong', 1], k: ['hong', 2], l: ['hong', 3], ';': ['hong', 'gj'], p: ['hong', 'undo'],
};
const KEY_HINTS: Record<Side, Partial<Record<string, string>>> = {
  chung: { '1': 'A', '2': 'S', '3': 'D', gj: 'F', undo: 'Q' },
  hong: { '1': 'J', '2': 'K', '3': 'L', gj: ';', undo: 'P' },
};
const FRAME = 1 / 30;
const POINT_CHOICES = ['1', '2', '3', '4', '6', 'gj'];
const RATES = [0.5, 0.75, 1, 1.5];
let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

interface Props {
  t: Dict;
  videos: VideoInfo[];
  selected: string;
  onSelect: (id: string) => void;
  entry: MarksEntry | undefined;
  saveMarks: (videoId: string, duration: number | null, marks: Mark[]) => void;
  commitMarks: (videoId: string, duration: number | null, marks: Mark[]) => void;
  settings: JudgeSettings;
  saveSettings: (s: JudgeSettings) => void;
  upload: (file: File) => void;
  uploading: boolean;
}

/**
 * Making questions: play the clip and press as a judge would. Presses in this pass become marks
 * through the same rules as the phones (a quick second 2 or 3 is a turning kick, Undo takes back
 * the last press on that side). Editing the list, or leaving the clip, keeps the pass for good.
 */
export function Author({ t, videos, selected, onSelect, entry, saveMarks, commitMarks, settings, saveSettings, upload, uploading }: Props) {
  const video = videos.find(v => v.id === selected) ?? null;
  const playerRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [pass, setPass] = useState<Tap[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);

  const base = entry?.marks;
  const marks = useMemo(() => {
    const fromPass: Mark[] = normalize(pass, settings.doubleWindow)
      .map(x => ({ id: x.id, t: x.t, side: x.side, kind: x.kind, points: [x.value] }));
    return [...(base ?? []), ...fromPass].sort((a, b) => a.t - b.t);
  }, [base, pass, settings.doubleWindow]);
  const knownDuration = duration ?? entry?.duration ?? null;
  const questions = useMemo(
    () => buildQuestionSet(selected, marks, knownDuration ?? Infinity, settings),
    [selected, marks, knownDuration, settings],
  );

  // The cleanup below runs after the next render has begun, so it reads the values from here,
  // which an effect updates only after that cleanup has had its turn.
  const latest = useRef({ selected, marks, duration: knownDuration, pending: false });
  useEffect(() => { latest.current = { selected, marks, duration: knownDuration, pending: pass.length > 0 }; });
  // Leaving this clip (or this tab) keeps the marks from the current pass.
  useEffect(() => () => {
    const l = latest.current;
    if (l.pending && l.selected) commitMarks(l.selected, l.duration, l.marks);
  }, [selected, commitMarks]);
  useEffect(() => { setPass([]); setDuration(null); setSaveState('idle'); dirty.current = false; }, [selected]);

  // Save shortly after the last press, so nothing is lost if the page closes mid-pass.
  useEffect(() => {
    if (!dirty.current || !selected) return;
    setSaveState('saving');
    const id = window.setTimeout(() => { saveMarks(selected, knownDuration, marks); dirty.current = false; setSaveState('saved'); }, 500);
    return () => clearTimeout(id);
  }, [marks, selected, knownDuration, saveMarks]);

  useEffect(() => {
    const p = playerRef.current;
    if (p) { p.defaultPlaybackRate = rate; p.playbackRate = rate; }
  }, [rate, video]);

  const lastTap = useRef({ key: '', at: 0 });
  function onTap(side: Side, value: TapValue, el?: Element | null) {
    const p = playerRef.current;
    if (!p || !video) return;
    const key = side + value, now = performance.now();
    if (lastTap.current.key === key && now - lastTap.current.at < 70) return;   // touch bounce only
    lastTap.current = { key, at: now };
    // Read the time now. React runs the state updater later, when the video has moved on.
    const tap: Tap = { id: newId(), side, value, t: p.currentTime };
    flash(el ?? document.querySelector(`.a-arena [data-side="${side}"][data-val="${value}"]`));
    dirty.current = true;
    setPass(list => [...list, tap]);
  }

  // Re-bound every render so the handler always sees the current clip and pass.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const p = playerRef.current;
      if (e.key === ' ') {
        if (!p) return;
        e.preventDefault();
        if (p.paused) p.play(); else p.pause();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!p) return;
        e.preventDefault();
        p.pause();
        p.currentTime = Math.max(0, p.currentTime + (e.key === 'ArrowLeft' ? -FRAME : FRAME));
        return;
      }
      const hit = KEYMAP[e.key.toLowerCase()];
      if (hit) { e.preventDefault(); onTap(hit[0], hit[1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function edit(next: Mark[]) {
    dirty.current = false;
    setPass([]);
    commitMarks(selected, knownDuration, next);
    setSaveState('saved');
  }
  const nudge = (id: string, d: number) =>
    edit(marks.map(m => (m.id === id ? { ...m, t: Math.max(0, Math.min(knownDuration ?? Infinity, m.t + d)) } : m)));
  const setPoint = (id: string, choice: string) =>
    edit(marks.map(m => (m.id !== id ? m : choice === 'gj' ? { ...m, kind: 'gj' as const, points: [1] } : { ...m, kind: 'pt' as const, points: [Number(choice)] })));
  const remove = (id: string) => edit(marks.filter(m => m.id !== id));
  const clearAll = () => { if (marks.length && confirm(fmt(t.confirmClear, { n: marks.length }))) edit([]); };
  function seekTo(m: Mark) {
    const p = playerRef.current; if (!p) return;
    p.currentTime = Math.max(0, m.t - 1);
    p.play();
  }

  return (
    <>
      <div className="col">
        <div className="card">
          <h2>{t.clip}</h2>
          <label className="btn" style={{ alignSelf: 'flex-start' }}>
            {t.upload}
            <input type="file" accept="video/*" hidden disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          </label>
          {uploading && <div className="msg info">{t.uploading}</div>}
          <select className="sel" value={selected} onChange={e => onSelect(e.target.value)}>
            {videos.length === 0 && <option value="">—</option>}
            {videos.map(v => <option key={v.id} value={v.id}>{v.name} ({(v.size / 1e6).toFixed(1)} MB)</option>)}
          </select>
          <div className="status">{t.clipNotice}</div>
        </div>
        <div className="card">
          <h2>{t.questions} · {questions.length}</h2>
          <div className="status">{fmt(t.questionsHelp, { pre: settings.pre, post: settings.post })}</div>
          <label className="settings-row">
            <span>{t.before}</span>
            <NumberField label={t.before} value={settings.pre} min={1} max={15} step={1} onCommit={v => saveSettings({ ...settings, pre: v })} />
          </label>
          <label className="settings-row">
            <span>{t.after}</span>
            <NumberField label={t.after} value={settings.post} min={2} max={15} step={1} onCommit={v => saveSettings({ ...settings, post: v })} />
          </label>
          <label className="settings-row">
            <span>{t.preVary}</span>
            <NumberField label={t.preVary} value={settings.preVary} min={0} max={10} step={1} onCommit={v => saveSettings({ ...settings, preVary: v })} />
          </label>
          <div className="status">{t.quietHelp}</div>
          <ol className="q-list">
            {questions.map((q, i) => {
              const len = q.end - q.start;
              return (
                <li key={q.id} className="q-row">
                  <b>{fmt(t.qLabel, { n: i + 1 })}</b>
                  <span className="mono">{clock(q.start)}–{clock(q.end)}</span>
                  <span className="muted">{fmt(t.qMeta, { len: Math.round(len), n: q.marks.length })}</span>
                  {q.marks.length === 0 && <span className="pill">{t.quiet}</span>}
                  {len > 20 && <span className="warn">{t.longQuestion}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="col">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t.markTitle}</h2>
            <span className="status">{saveState === 'saving' ? t.saving : saveState === 'saved' ? t.saved : ''}</span>
          </div>
          <div className="status">{t.markHelp}</div>
          <div className="a-arena">
            <TapPanel side="chung" t={t} disabled={!video} onTap={onTap} keys={KEY_HINTS.chung} />
            <div className="stage a-stage">
              {video ? (
                <video
                  ref={playerRef} src={video.url} controls playsInline preload="auto"
                  onLoadedMetadata={e => {
                    const v = e.currentTarget;
                    setDuration(Number.isFinite(v.duration) ? v.duration : null);
                    v.defaultPlaybackRate = rate; v.playbackRate = rate;
                  }}
                />
              ) : <div className="overlay">{t.chooseClipFirst}</div>}
            </div>
            <TapPanel side="hong" t={t} disabled={!video} onTap={onTap} keys={KEY_HINTS.hong} />
          </div>
          <label className="row status">
            {t.speed}
            <select className="sel sm" value={rate} onChange={e => setRate(Number(e.target.value))}>
              {RATES.map(r => <option key={r} value={r}>{r}×</option>)}
            </select>
          </label>
          <div className="status">{t.keysHelp}</div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t.marks} · {marks.length}</h2>
            <button className="btn" style={{ height: 32, fontSize: 13 }} disabled={marks.length === 0} onClick={clearAll}>{t.clearMarks}</button>
          </div>
          {marks.length === 0 ? <div className="status">{t.noMarks}</div> : (
            <div className="taps-wrap">
              <table className="taps">
                <thead><tr><th>{t.colTimeShort}</th><th>{t.colSide}</th><th>{t.colPoint}</th><th /></tr></thead>
                <tbody>
                  {marks.map(m => (
                    <tr key={m.id}>
                      <td><button className="link mono" title={t.seekHint} onClick={() => seekTo(m)}>{clock(m.t, 2)}</button></td>
                      <td className={m.side === 'chung' ? 'chung-t' : 'hong-t'}>{sideLabel(t, m.side)}</td>
                      <td>
                        <select className="sel sm" aria-label={t.colPoint} value={m.kind === 'gj' ? 'gj' : String(m.points[0])} onChange={e => setPoint(m.id, e.target.value)}>
                          {POINT_CHOICES.map(c => <option key={c} value={c}>{c === 'gj' ? t.gamjeom : c}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" aria-label={t.frameEarlier} title={t.frameEarlier} onClick={() => nudge(m.id, -FRAME)}>◀</button>
                          <button className="icon-btn" aria-label={t.frameLater} title={t.frameLater} onClick={() => nudge(m.id, FRAME)}>▶</button>
                          <button className="icon-btn danger" aria-label={t.remove} title={t.remove} onClick={() => remove(m.id)}>×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
