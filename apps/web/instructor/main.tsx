import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PROTOCOL_VERSION, type Attempt, type ClientMessage, type JudgeSettings, type Mark, type Question, type TapRecord, type TraineeInfo } from '@scoring-test/shared';
import { Socket } from '../src/ws';
import { say, serverError, useLang, type Msg } from '../src/i18n';
import { LangSelect } from '../src/LangSelect';
import { Help } from '../src/Help';
import { Author } from './Author';
import { Run } from './Run';
import type { Info, MarksEntry } from './types';

type Tab = 'author' | 'run';
function loadTab(): Tab {
  try { return localStorage.getItem('st.tab') === 'run' ? 'run' : 'author'; } catch { return 'author'; }
}

function App() {
  const { lang, setLang, t } = useLang();
  const [tab, setTabState] = useState<Tab>(loadTab);
  const [info, setInfo] = useState<Info | null>(null);
  const [connected, setConnected] = useState(false);
  const [trainees, setTrainees] = useState<TraineeInfo[]>([]);
  const [taps, setTaps] = useState<TapRecord[]>([]);
  const [marks, setMarks] = useState<Record<string, MarksEntry>>({});
  const [current, setCurrent] = useState<Question | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);   // every play of this session
  const [selected, setSelected] = useState('');   // the clip, shared by both tabs
  const [notice, setNotice] = useState<Msg | null>(null);
  const [uploading, setUploading] = useState(false);
  const sockRef = useRef<Socket | null>(null);

  useEffect(() => {
    const sock = new Socket(() => ({ type: 'hello', role: 'instructor', version: PROTOCOL_VERSION }));
    sock.onStatus = setConnected;
    sock.on(msg => {
      switch (msg.type) {
        case 'info':
          setInfo({ session: msg.session, appVersion: msg.appVersion, addresses: msg.addresses, videos: msg.videos, settings: msg.settings, current: msg.current, group: msg.group });
          setCurrent(msg.current);
          setSelected(s => s || msg.videos[0]?.id || '');
          break;
        case 'trainees': setTrainees(msg.list); break;
        case 'tap': setTaps(list => [msg.tap, ...list].slice(0, 200)); break;
        case 'marks': setMarks(m => ({ ...m, [msg.videoId]: { duration: msg.duration, marks: msg.marks } })); break;
        case 'attempts': setAttempts(msg.list); break;
        case 'attempt':
          setAttempts(list => (list.some(a => a.id === msg.attempt.id)
            ? list.map(a => (a.id === msg.attempt.id ? msg.attempt : a))
            : [...list, msg.attempt]));
          break;
        case 'error': setNotice(serverError(msg.code, msg.name)); break;
        case 'ended': break;
      }
    });
    sock.start();
    sockRef.current = sock;
    return () => sock.stop();
  }, []);

  // Fetch a clip's saved marks the first time it is chosen.
  useEffect(() => {
    if (connected && selected && !marks[selected]) sockRef.current?.send({ type: 'getMarks', videoId: selected });
  }, [connected, selected, marks]);

  const send = useCallback((m: ClientMessage) => sockRef.current?.send(m), []);
  /** Save to disk only (autosave while marking). */
  const saveMarks = useCallback((videoId: string, duration: number | null, list: Mark[]) => {
    send({ type: 'saveMarks', videoId, duration, marks: list });
  }, [send]);
  /** Make these the clip's marks everywhere on this page, and save them. */
  const commitMarks = useCallback((videoId: string, duration: number | null, list: Mark[]) => {
    setMarks(m => ({ ...m, [videoId]: { duration, marks: list } }));
    send({ type: 'saveMarks', videoId, duration, marks: list });
  }, [send]);
  const saveSettings = useCallback((s: JudgeSettings) => send({ type: 'saveSettings', settings: s }), [send]);
  const loadQuestion = useCallback((q: Question) => {
    setCurrent(q); setTaps([]);
    send({ type: 'load', question: q });
  }, [send]);
  const play = useCallback((questionId: string) => { setTaps([]); send({ type: 'play', questionId }); }, [send]);
  const stop = useCallback(() => send({ type: 'stop' }), [send]);
  const nextGroup = useCallback(() => send({ type: 'nextGroup' }), [send]);

  function setTab(next: Tab) {
    setTabState(next);
    try { localStorage.setItem('st.tab', next); } catch { /* not remembered */ }
  }

  async function upload(file: File) {
    setUploading(true); setNotice(null);
    try {
      const res = await fetch('/api/video?name=' + encodeURIComponent(file.name), { method: 'POST', body: file });
      const j = await res.json();
      if (j.video) setSelected(j.video.id);
    } catch (e) { setNotice({ key: 'uploadFailed', vars: { msg: (e as Error).message } }); }
    setUploading(false);
  }

  return (
    <div className="inst">
      <header className="inst-head">
        <h1>Scoring Test{info && <span className="ver"> v{info.appVersion}</span>}</h1>
        <div className="seg" role="group" aria-label={t.tabsLabel}>
          <button aria-pressed={tab === 'author'} onClick={() => setTab('author')}>{t.tabAuthor}</button>
          <button aria-pressed={tab === 'run'} onClick={() => setTab('run')}>{t.tabRun}</button>
        </div>
        <div className="row">
          <Help t={t} sections={t.help.instructor} />
          <LangSelect lang={lang} setLang={setLang} label={t.language} />
        </div>
      </header>

      {notice && (
        <div className="msg err inst-wide row" style={{ justifyContent: 'space-between' }}>
          <span>{say(t, notice)}</span>
          <button onClick={() => setNotice(null)} aria-label={t.close}>×</button>
        </div>
      )}

      {!info ? (
        <div className="status inst-wide"><span className={'dot' + (connected ? ' on' : '')} />{connected ? t.connected : t.connecting}</div>
      ) : tab === 'author' ? (
        <Author
          t={t} videos={info.videos} selected={selected} onSelect={setSelected} entry={marks[selected]}
          saveMarks={saveMarks} commitMarks={commitMarks} settings={info.settings} saveSettings={saveSettings}
          upload={upload} uploading={uploading}
        />
      ) : (
        <Run
          t={t} info={info} trainees={trainees} taps={taps} selected={selected} onSelect={setSelected}
          entry={marks[selected]} settings={info.settings} saveSettings={saveSettings}
          current={current} attempts={attempts} loadQuestion={loadQuestion} play={play} stop={stop} nextGroup={nextGroup}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
