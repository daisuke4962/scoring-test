import { useEffect, useMemo, useRef, useState } from 'react';
import { buildQuestionSet, wholeClip, type Attempt, type JudgeSettings, type Question, type TapRecord, type TraineeInfo } from '@scoring-test/shared';
import { fmt, sideLabel, valueLabel, type Dict } from '../src/i18n';
import { clock, localStamp, pointLabel, signed, timeOfDay } from '../src/format';
import { NumberField } from '../src/NumberField';
import { useDuration } from './useDuration';
import type { Info, MarksEntry } from './types';

// How phones reach this PC. The app cannot switch networks itself; the mode picks the
// setup steps to show and how many trainees fit in one group.
type NetMode = 'wifi' | 'tether';
const NET_MODES: NetMode[] = ['wifi', 'tether'];
const SEATS: Record<NetMode, number> = { wifi: 5, tether: 4 };
const netLabel = (t: Dict, m: NetMode) => (m === 'wifi' ? t.netWifi : t.netTether);
const netSteps = (t: Dict, m: NetMode) => (m === 'wifi' ? t.stepsWifi : t.stepsTether);
function loadNetMode(): NetMode {
  try { return localStorage.getItem('st.netMode') === 'tether' ? 'tether' : 'wifi'; } catch { return 'wifi'; }
}

interface Props {
  t: Dict;
  info: Info;
  trainees: TraineeInfo[];
  taps: TapRecord[];
  selected: string;
  onSelect: (id: string) => void;
  entry: MarksEntry | undefined;
  marks: Record<string, MarksEntry>;
  settings: JudgeSettings;
  saveSettings: (s: JudgeSettings) => void;
  current: Question | null;
  attempts: Attempt[];
  loadQuestion: (q: Question) => void;
  play: (questionId: string) => void;
  stop: () => void;
  nextGroup: () => void;
}

/** Running a test: connect phones, send a question, play it, and read the results as they come in. */
export function Run({ t, info, trainees, taps, selected, onSelect, entry, marks, settings, saveSettings, current, attempts, loadQuestion, play, stop, nextGroup }: Props) {
  const [addrIndex, setAddrIndex] = useState(0);
  const [bigQr, setBigQr] = useState(false);   // the QR across the whole screen, for a room
  const [netMode, setNetMode] = useState<NetMode>(loadNetMode);
  const [picked, setPicked] = useState('');
  const [pickedAttempt, setPickedAttempt] = useState('');
  const [clipFilter, setClipFilter] = useState('');     // '' = every clip
  const [order, setOrder] = useState<string[] | null>(null);   // null = the order they were marked in

  const video = info.videos.find(v => v.id === selected) ?? null;
  // Clips never opened under "Make questions" have no saved length yet; read it from the file.
  const probed = useDuration(video && entry && entry.duration == null ? video.url : null);
  const duration = entry?.duration ?? probed;
  // Every clip that has been marked contributes its questions. A clip is left out until its
  // length is known, because a question cannot end where the clip does not.
  const byClip = useMemo(() => {
    const out: { video: typeof info.videos[number]; questions: Question[]; whole: Question }[] = [];
    for (const v of info.videos) {
      const e = marks[v.id];
      if (!e || e.marks.length === 0) continue;
      const dur = e.duration ?? (v.id === selected ? probed : null);
      if (dur == null) continue;
      out.push({ video: v, questions: buildQuestionSet(v.id, e.marks, dur, settings), whole: wholeClip(v.id, e.marks, dur) });
    }
    return out;
  }, [info.videos, marks, selected, probed, settings]);

  const shownClips = byClip.filter(c => !clipFilter || c.video.id === clipFilter);
  const naturalQs = shownClips.flatMap(c => c.questions);
  const wholeQs = shownClips.map(c => c.whole);
  // The test's running order. Questions marked after a shuffle join the end rather than vanish.
  const splitQs = useMemo(() => {
    if (!order) return naturalQs;
    const byId = new Map(naturalQs.map(q => [q.id, q]));
    const kept = order.map(id => byId.get(id)).filter((q): q is Question => !!q);
    return [...kept, ...naturalQs.filter(q => !order.includes(q.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalQs.map(q => q.id).join(), order]);

  const pickable = [...splitQs, ...wholeQs];
  const pickedQ = pickable.find(q => q.id === picked) ?? splitQs[0] ?? pickable[0] ?? null;
  const pickedIndex = pickedQ ? splitQs.findIndex(q => q.id === pickedQ.id) : -1;
  const nextQ = pickedIndex >= 0 ? splitQs[pickedIndex + 1] ?? null : splitQs[0] ?? null;
  // The clip the picked question belongs to, which is what the preview shows.
  const qVideo = pickedQ ? info.videos.find(v => v.id === pickedQ.videoId) ?? null : video;
  const clipName = (id: string) => info.videos.find(v => v.id === id)?.name ?? id;
  const qName = (q: Question) => {
    if (q.id.endsWith('@all')) return t.wholeClip;
    // Numbered within its own clip, so the label matches what "Make questions" shows.
    const own = byClip.find(c => c.video.id === q.videoId)?.questions ?? [];
    const i = own.findIndex(x => x.id === q.id);
    return i >= 0 ? fmt(t.qLabel, { n: i + 1 }) : `${clock(q.start)}–${clock(q.end)}`;
  };

  /** Pick a question, and bring the rest of the page to its clip. */
  function pick(q: Question) {
    setPicked(q.id);
    if (q.videoId !== selected) onSelect(q.videoId);
  }
  /**
   * A new order every time, but each clip's questions stay together: a question from another clip
   * means every phone has to fetch that clip, and a seminar network is not the place to do that
   * once per question. So the clips are shuffled, and the questions inside each one.
   */
  function shuffleOrder() {
    const shuffled = <T,>(xs: T[]) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const clips = shuffled([...new Set(splitQs.map(q => q.videoId))]);
    const ids = clips.flatMap(id => shuffled(splitQs.filter(q => q.videoId === id)).map(q => q.id));
    setOrder(ids);
    const first = splitQs.find(q => q.id === ids[0]);
    if (first) pick(first);
  }
  function naturalOrder() {
    setOrder(null);
    if (naturalQs[0]) pick(naturalQs[0]);
  }

  useEffect(() => {
    if (!bigQr) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBigQr(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bigQr]);

  function chooseNetMode(m: NetMode) {
    setNetMode(m);
    try { localStorage.setItem('st.netMode', m); } catch { /* private mode: just not remembered */ }
  }
  function goNext() {
    if (!nextQ) return;
    pick(nextQ);   // the next question may belong to another clip, so bring the page with it
    loadQuestion(nextQ);
  }

  const online = trainees.filter(p => p.connected);
  const loadedCount = current ? online.filter(p => p.loadedVideo === current.videoId).length : 0;
  const pickedIsOnPhones = !!current && !!pickedQ && current.id === pickedQ.id;
  const seats = SEATS[netMode];
  const address = info.addresses[addrIndex] ?? info.addresses[0];
  // iPhone Personal Hotspot always hands out 172.20.10.x, so this PC being on one is easy to spot.
  const onIphoneHotspot = !!address?.address.startsWith('172.20.10.');
  // The session's record. Pick an earlier play to look back at it; otherwise the newest one shows
  // and keeps filling in as phones finish.
  const shown = attempts.find(a => a.id === pickedAttempt) ?? attempts[attempts.length - 1] ?? null;
  const isLive = !!shown && shown.id === attempts[attempts.length - 1]?.id;
  const resultRows = !shown ? [] : [
    ...shown.results.map(r => ({ id: r.traineeId, name: r.name, r: r.result })),
    ...(isLive ? online.filter(p => !shown.results.some(r => r.traineeId === p.id)).map(p => ({ id: p.id, name: p.name, r: null })) : []),
  ];
  const attemptLabel = (a: Attempt) => [
    fmt(t.groupN, { n: a.group }),
    qName(a.question),
    a.round > 1 ? fmt(t.round, { n: a.round }) : '',
    timeOfDay(a.at),
    fmt(t.peopleJudged, { n: a.results.length }),
  ].filter(Boolean).join(' · ');

  // The instructor watches the same stretch as the phones: parked on the first frame of whichever
  // question is about to go out, running when Play is pressed, and stopping where the phones stop.
  const previewRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !pickedQ) return;
    const seek = () => { if (v.paused) v.currentTime = pickedQ.start; };
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [pickedQ?.id, pickedQ?.start, qVideo?.id]);
  useEffect(() => {
    const v = previewRef.current;
    if (!v || !current) return;
    const stopAtEnd = () => { if (!v.paused && v.currentTime >= current.end - 0.05) v.pause(); };
    v.addEventListener('timeupdate', stopAtEnd);
    return () => v.removeEventListener('timeupdate', stopAtEnd);
  }, [current]);

  function playAll() {
    if (!current) return;
    play(current.id);
    const v = previewRef.current;
    if (v) { v.currentTime = current.start; v.play().catch(() => { /* the phones still play */ }); }
  }
  function stopAll() {
    stop();
    previewRef.current?.pause();
  }

  /** Hand the phones to the next few people. The questions and the record stay as they are. */
  function askNextGroup() {
    if (online.length > 0 && !confirm(fmt(t.confirmNextGroup, { n: online.length, next: info.group + 1 }))) return;
    setPickedAttempt('');
    nextGroup();
  }

  /** The whole session as one CSV: a row per trainee per play. */
  function saveCsv() {
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['session', 'group', 'attempt', 'round', 'question', 'clip', 'start', 'end', 'marks', 'trainee',
      'correct', 'wrongValue', 'wrongSide', 'missed', 'extra', 'medianDelay', 'playedAt'];
    const rows = attempts.flatMap(a => a.results.map(r => [
      info.session, a.group, a.id, a.round, qName(a.question), a.question.videoId,
      a.question.start.toFixed(2), a.question.end.toFixed(2), a.question.marks.length, r.name,
      r.result.counts.correct, r.result.counts.value, r.result.counts.color,
      r.result.counts.miss, r.result.counts.extra,
      r.result.medianDt == null ? '' : r.result.medianDt.toFixed(2),
      localStamp(a.at),
    ]));
    const csv = [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    // The leading mark is what makes Excel on Windows read the names as UTF-8.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `scoring-test-${info.session}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="col">
        <div className="card">
          <h2>{t.network}</h2>
          <div className="seg" role="group" aria-label={t.howPhonesConnect}>
            {NET_MODES.map(m => (
              <button key={m} aria-pressed={netMode === m} onClick={() => chooseNetMode(m)}>{netLabel(t, m)}</button>
            ))}
          </div>
          <ol className="steps">
            {netSteps(t, netMode).map(s => <li key={s}>{s}</li>)}
          </ol>
          {netMode === 'wifi' && onIphoneHotspot && (
            <div className="msg info">
              {t.onIphoneHotspot}{' '}
              <button style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 700 }} onClick={() => chooseNetMode('tether')}>{t.switchToTether}</button>
            </div>
          )}
        </div>

        <div className="card">
          <h2>{t.join}</h2>
          {!address ? <div className="msg err">{t.noAddress}</div> : (
            <>
              <button className="qr-open" onClick={() => setBigQr(true)} aria-label={t.showBig}>
                <img src={address.qr} alt={t.qrAlt} />
              </button>
              <div className="code">{info.session}</div>
              <div className="url">{address.url}</div>
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setBigQr(true)}>{t.showBig}</button>
              {info.addresses.length > 1 && (
                <>
                  <div className="status">{t.tryOtherNetwork}</div>
                  <div className="row">
                    {info.addresses.map((a, i) => (
                      <button key={a.url} className={'btn' + (a === address ? ' primary' : '')} style={{ height: 36, fontSize: 13 }} onClick={() => setAddrIndex(i)}>
                        {a.label}{a.primary ? ' ★' : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2>{t.judging}</h2>
          <label className="settings-row">
            <span>{t.tolerance}</span>
            <NumberField label={t.tolerance} value={settings.tolerance} min={0.3} max={2} step={0.1} onCommit={v => saveSettings({ ...settings, tolerance: v })} />
          </label>
          <label className="settings-row">
            <span>{t.lead}</span>
            <NumberField label={t.lead} value={settings.lead} min={0} max={1} step={0.1} onCommit={v => saveSettings({ ...settings, lead: v })} />
          </label>
          <label className="settings-row">
            <span>{t.doubleWindow}</span>
            <NumberField label={t.doubleWindow} value={settings.doubleWindow} min={0.3} max={2} step={0.1} onCommit={v => saveSettings({ ...settings, doubleWindow: v })} />
          </label>
          <div className="status">{t.judgingHelp}</div>
        </div>
      </div>

      <div className="col">
        <div className="card">
          <h2>{t.question}</h2>
          <label className="field-label">
            <span className="status">{t.clip}</span>
            <select className="sel" value={clipFilter} onChange={e => { setClipFilter(e.target.value); setPicked(''); }}>
              <option value="">{t.allClips}</option>
              {info.videos.map(v => <option key={v.id} value={v.id}>{v.name} ({(v.size / 1e6).toFixed(1)} MB)</option>)}
            </select>
          </label>
          <div className="stage a-stage">
            {qVideo
              ? <video ref={previewRef} src={qVideo.url} muted controls playsInline preload="auto" />
              : <div className="overlay">{t.chooseClipFirst}</div>}
            {qVideo && !pickedQ && <div className="overlay">{t.previewHint}</div>}
          </div>
          {video && !entry && <div className="status">{t.loadingMarks}</div>}
          {byClip.length === 0 && entry && entry.marks.length === 0 && <div className="msg info">{t.noMarksRun}</div>}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="status">
              {t.questions} · {splitQs.length}
              {order && <> · <b>{t.shuffled}</b></>}
              {pickedIndex >= 0 && <> · {fmt(t.qProgress, { n: pickedIndex + 1, total: splitQs.length })}</>}
            </span>
            <span className="row">
              <button className="icon-btn" disabled={splitQs.length < 2} onClick={shuffleOrder}>{t.shuffle}</button>
              {order && <button className="icon-btn" onClick={naturalOrder}>{t.inOrder}</button>}
            </span>
          </div>
          <div className="q-list">
            {splitQs.concat(wholeQs).map(q => (
              <button key={q.id} className="q-item" aria-pressed={pickedQ?.id === q.id} onClick={() => pick(q)}>
                <b>{qName(q)}</b>
                <span className="mono">{clock(q.start)}–{clock(q.end)}</span>
                <span className="muted">{q.marks.length === 0 ? t.quiet : fmt(t.marksCount, { n: q.marks.length })}</span>
                <span className="muted clip-of">{byClip.length > 1 ? clipName(q.videoId) : ''}</span>
                {current?.id === q.id ? <span className="pill on">{t.sent}</span> : <span />}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn" disabled={!pickedQ} onClick={() => pickedQ && loadQuestion(pickedQ)}>{t.sendToPhones}</button>
            <button className="btn primary" disabled={!pickedIsOnPhones || loadedCount === 0} onClick={playAll}>
              {t.play} ({loadedCount}/{online.length})
            </button>
            <button className="btn" onClick={stopAll}>{t.stop}</button>
            <button className="btn" disabled={!nextQ || nextQ.id === pickedQ?.id} onClick={goNext}>{t.nextQuestion}</button>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t.trainees} · {fmt(t.groupN, { n: info.group })} · {online.length} / {seats}</h2>
            <div className="row">
              {online.length >= seats && <span className="pill on">{t.groupFull}</span>}
              <button className="btn" style={{ height: 32, fontSize: 13 }} onClick={askNextGroup}>{t.nextGroup}</button>
            </div>
          </div>
          <div className="list">
            {trainees.length === 0 && <div className="status">{t.nobodyYet}</div>}
            {trainees.map(p => (
              <div key={p.id} className="trainee">
                <span>{p.name}</span>
                <span className={'pill ' + (p.connected ? 'on' : 'off')}>{p.connected ? t.online : t.offline}</span>
                <span className={'pill ' + (p.ready ? 'on' : '')}>{p.ready ? t.ready : t.notReady}</span>
                <span className={'pill ' + (current && p.loadedVideo === current.videoId ? 'on' : '')}>{p.loadedVideo ? t.loaded : t.noClip}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{t.results}</h2>
            <button className="btn" style={{ height: 32, fontSize: 13 }} disabled={attempts.length === 0} onClick={saveCsv}>{t.saveCsv}</button>
          </div>
          {!shown ? <div className="status">{t.noResultsYet}</div> : (
            <>
              <label className="field-label">
                <span className="status">{t.pastQuestions}</span>
                <select className="sel" value={shown.id} onChange={e => setPickedAttempt(e.target.value)}>
                  {[...attempts].reverse().map(a => <option key={a.id} value={a.id}>{attemptLabel(a)}</option>)}
                </select>
              </label>
              {shown.question.marks.length > 0 && (
                <div className="taps-wrap">
                  <table className="taps">
                    <thead><tr><th>{t.colTimeShort}</th><th>{t.colSide}</th><th>{t.colPoint}</th><th className="n">{t.agreementCol}</th></tr></thead>
                    <tbody>
                      {shown.question.marks.map((m, i) => {
                        const ok = shown.results.filter(r => r.result.marks[i]?.verdict === 'correct').length;
                        return (
                          <tr key={m.id}>
                            <td className="mono">{clock(m.t)}</td>
                            <td className={m.side === 'chung' ? 'chung-t' : 'hong-t'}>{sideLabel(t, m.side)}</td>
                            <td>{pointLabel(t, m)}</td>
                            <td className="n">{shown.results.length ? fmt(t.agreement, { n: ok, total: shown.results.length }) : t.waiting}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="taps-wrap">
                <table className="taps">
                  <thead>
                    <tr>
                      <th>{t.colName}</th>
                      <th className="n">{t.verdict.correct}</th><th className="n">{t.verdict.value}</th><th className="n">{t.verdict.color}</th>
                      <th className="n">{t.verdict.miss}</th><th className="n">{t.verdict.extra}</th><th className="n">{t.reaction}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.length === 0 && <tr><td colSpan={7} className="status">{t.nobodyYet}</td></tr>}
                    {resultRows.map(({ id, name, r }) => (
                      <tr key={id}>
                        <td>{name}</td>
                        {r ? (
                          <>
                            <td className="n v-correct">{r.counts.correct} / {shown.question.marks.length}</td>
                            <td className="n">{r.counts.value}</td>
                            <td className="n">{r.counts.color}</td>
                            <td className="n">{r.counts.miss}</td>
                            <td className="n">{r.counts.extra}</td>
                            <td className="n">{r.medianDt == null ? '—' : signed(r.medianDt)}</td>
                          </>
                        ) : <td colSpan={6} className="n status">{t.waiting}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>{t.taps}</h2>
          <div className="taps-wrap">
            <table className="taps">
              <thead><tr><th>{t.colName}</th><th>{t.colClip}</th><th>{t.colSide}</th><th>{t.colValue}</th><th className="n">{t.colTime}</th></tr></thead>
              <tbody>
                {taps.map((tap, i) => (
                  <tr key={i}>
                    <td>{tap.name}</td><td>{tap.videoId}</td>
                    <td className={tap.side === 'chung' ? 'chung-t' : 'hong-t'}>{sideLabel(t, tap.side)}</td>
                    <td>{valueLabel(t, tap.value)}</td>
                    <td className="n">{tap.videoTime.toFixed(3)} s</td>
                  </tr>
                ))}
                {taps.length === 0 && <tr><td colSpan={5} className="status">{t.noTaps}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {bigQr && address && (
        <div className="qr-full" onClick={() => setBigQr(false)}>
          <img src={address.qr} alt={t.qrAlt} />
          <div className="qr-full-code">{info.session}</div>
          <div className="qr-full-url">{address.url}</div>
          <div className="qr-full-help">{t.bigQrHelp}</div>
        </div>
      )}
    </>
  );
}
