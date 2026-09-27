import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PROTOCOL_VERSION, type JudgeResult, type Mark, type QuestionCue, type Side, type TapValue, type VideoInfo } from '@scoring-test/shared';
import { Socket } from '../src/ws';
import { fmt, say, serverError, sideLabel, useLang, valueLabel, type Msg } from '../src/i18n';
import { LangSelect } from '../src/LangSelect';
import { TapPanel, flash } from '../src/TapPanel';
import { ResultView } from '../src/ResultView';
import { Help } from '../src/Help';

type Phase = 'join' | 'wait' | 'loading' | 'ready' | 'playing' | 'grace' | 'done' | 'result' | 'needsTap';
interface LocalTap { time: number; side: Side; value: TapValue }

function App() {
  const { lang, setLang, t } = useLang();
  const params = new URLSearchParams(location.search);
  const [session] = useState(params.get('s') || '');
  const [name, setName] = useState(() => localStorage.getItem('st.name') || '');
  const [joined, setJoined] = useState(false);
  const [released, setReleased] = useState(false);   // this group has been let go
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Msg | null>(null);
  const [phase, setPhaseState] = useState<Phase>('join');
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [taps, setTaps] = useState<LocalTap[]>([]);
  const [outcome, setOutcome] = useState<{ marks: Mark[]; result: JudgeResult } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sockRef = useRef<Socket | null>(null);
  const traineeIdRef = useRef<string | null>(sessionStorage.getItem('st.id'));
  // The socket and media listeners outlive renders, so what they need lives in refs.
  const phaseRef = useRef<Phase>('join');
  const cueRef = useRef<QuestionCue | null>(null);
  const toleranceRef = useRef(1);
  const graceRef = useRef<{ start: number; timer: number } | null>(null);
  const loadedUrlRef = useRef('');
  const unlockedRef = useRef(false);
  const lastTap = useRef({ key: '', at: 0 });

  function setPhase(p: Phase) { phaseRef.current = p; setPhaseState(p); }
  function clearGrace() {
    if (graceRef.current) { clearTimeout(graceRef.current.timer); graceRef.current = null; }
  }

  // The question's stretch is over: hold the last frame but keep taking presses for the accepted
  // time, so a point scored near the end is judged as fairly as one in the middle. Then report.
  function beginGrace() {
    if (phaseRef.current !== 'playing') return;
    videoRef.current?.pause();
    setPhase('grace');
    graceRef.current = { start: performance.now(), timer: window.setTimeout(finish, toleranceRef.current * 1000) };
  }
  function finish() {
    graceRef.current = null;
    const cue = cueRef.current; if (!cue) return;
    setPhase('done');
    sockRef.current?.send({ type: 'ended', questionId: cue.id });
  }
  function startPlay(questionId: string) {
    const v = videoRef.current, cue = cueRef.current;
    if (!v || !cue || cue.id !== questionId) return;
    clearGrace(); setOutcome(null); setTaps([]); setError(null);
    v.currentTime = cue.start;
    v.play().then(() => setPhase('playing')).catch((e: DOMException) => {
      // A phone that never got a tap of its own can still refuse; ask for one rather than fail.
      if (e?.name === 'NotAllowedError') setPhase('needsTap');
      else setError({ key: 'playFailed', vars: { msg: e.message } });
    });
  }
  function tapToPlay() {
    const v = videoRef.current; if (!v) return;
    unlockedRef.current = true; setUnlocked(true);
    v.play().then(() => setPhase('playing')).catch((e: DOMException) => setError({ key: 'playFailed', vars: { msg: e.message } }));
  }
  function stopPlay() {
    clearGrace();
    videoRef.current?.pause();
    if (phaseRef.current === 'playing' || phaseRef.current === 'grace') setPhase('ready');
  }

  // The tap that joins is also the gesture that lets the clip play later, so joining is one tap.
  function unlock() {
    const v = videoRef.current; if (!v) return;
    v.muted = true;
    if (!v.currentSrc) v.load();
    v.play().then(() => { v.pause(); v.muted = false; }).catch(() => { v.muted = false; });
    unlockedRef.current = true; setUnlocked(true);
    sockRef.current?.send({ type: 'ready' });
  }

  function join(who = name) {
    if (!who.trim() || !session) return;
    localStorage.setItem('st.name', who.trim());
    unlock();
    const sock = new Socket(() => ({ type: 'hello', role: 'trainee', version: PROTOCOL_VERSION, name: who.trim(), session, traineeId: traineeIdRef.current || undefined }));
    sock.onStatus = setConnected;
    sock.on(msg => {
      switch (msg.type) {
        case 'welcome':
          traineeIdRef.current = msg.traineeId; sessionStorage.setItem('st.id', msg.traineeId);
          setJoined(true); setReleased(false); setError(null);
          if (phaseRef.current === 'join') setPhase('wait');
          if (unlockedRef.current) sock.send({ type: 'ready' });
          break;
        case 'error': setError(serverError(msg.code, msg.name)); break;
        case 'load':
          clearGrace();
          cueRef.current = msg.question; toleranceRef.current = msg.tolerance;
          setOutcome(null); setTaps([]); setError(null);
          setPhase('loading');
          setVideo(msg.video);
          break;
        case 'play': startPlay(msg.questionId); break;
        case 'stop': stopPlay(); break;
        case 'result':
          if (msg.questionId === cueRef.current?.id && msg.traineeId === traineeIdRef.current) {
            setOutcome({ marks: msg.marks, result: msg.result });
            setPhase('result');
          }
          break;
        case 'released':
          // This group is done. Go back to the join screen so the phone can be handed on.
          clearGrace();
          videoRef.current?.pause();
          sessionStorage.removeItem('st.id');
          traineeIdRef.current = null;
          sock.stop();
          sockRef.current = null;
          cueRef.current = null;
          setJoined(false); setReleased(true); setConnected(false);
          setName(''); setVideo(null); setOutcome(null); setTaps([]); setError(null);
          setPhase('join');
          break;
      }
    });
    sock.start();
    sockRef.current = sock;
  }

  // If the page reloads mid-session (phone locked, browser evicted the tab), rejoin on our own.
  // The server keeps our id, so the instructor sees the same person come back, not a new one.
  useEffect(() => {
    const saved = localStorage.getItem('st.name');
    if (session && saved && sessionStorage.getItem('st.id')) join(saved);
    return () => clearGrace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a question arrives, make sure its clip is ready to play before reporting "loaded".
  // The same clip for the next question is already there, so report straight away.
  useEffect(() => {
    const v = videoRef.current; if (!v || !video) return;
    const report = () => {
      sockRef.current?.send({ type: 'loaded', videoId: video.id });
      if (phaseRef.current === 'loading') setPhase('ready');
    };
    if (loadedUrlRef.current === video.url && v.readyState >= 3) { report(); return; }
    const onCan = () => { loadedUrlRef.current = video.url; report(); };
    const onErr = () => {
      sockRef.current?.send({ type: 'loadError', videoId: video.id, message: 'cannot play this file' });
      setError({ key: 'cannotPlayHere' });
    };
    v.addEventListener('canplaythrough', onCan, { once: true });
    v.addEventListener('error', onErr, { once: true });
    v.preload = 'auto'; v.src = video.url; v.load();
    return () => { v.removeEventListener('canplaythrough', onCan); v.removeEventListener('error', onErr); };
  }, [video]);

  // Stop at the end of the question's stretch (or of the clip) and start the grace time.
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const check = () => {
      const cue = cueRef.current;
      if (phaseRef.current === 'playing' && cue && (v.currentTime >= cue.end - 0.05 || v.ended)) beginGrace();
    };
    v.addEventListener('timeupdate', check);
    v.addEventListener('ended', check);
    return () => { v.removeEventListener('timeupdate', check); v.removeEventListener('ended', check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tap(side: Side, value: TapValue, el: HTMLButtonElement) {
    const v = videoRef.current, cue = cueRef.current, p = phaseRef.current;
    if (!v || !cue || (p !== 'playing' && p !== 'grace')) return;
    const key = side + value, now = performance.now();
    if (lastTap.current.key === key && now - lastTap.current.at < 70) return;   // touch bounce only
    lastTap.current = { key, at: now };
    flash(el);
    // During the grace time the video is paused at the end, so count on from there.
    const time = p === 'grace' && graceRef.current ? cue.end + (now - graceRef.current.start) / 1000 : v.currentTime;
    sockRef.current?.send({ type: 'tap', questionId: cue.id, side, value, videoTime: time, wallTime: Date.now() });
    setTaps(list => [...list.slice(-4), { time, side, value }]);
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
  }

  // Split around the placeholder so the session code can be bold in any word order.
  const [before, after = ''] = t.enterName.split('{code}');
  const joinForm = (
    <div className="join-form">
      {released && <div className="msg info">{t.groupDone}</div>}
      <p>{before}<b>{session || t.noSession}</b>{after}</p>
      {!session && <div className="msg err">{t.openFromQr}</div>}
      <input className="field" placeholder={t.yourName} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && join()} />
      <button className="btn primary wide" onClick={() => join()} disabled={!name.trim() || !session}>{t.join}</button>
      {error && <div className="msg err">{say(t, error)}</div>}
    </div>
  );

  const overlay =
    !joined ? joinForm
    : !unlocked ? <button className="btn primary" onClick={unlock}>{t.readyBtn}</button>
    : phase === 'needsTap' ? <button className="btn primary" onClick={tapToPlay}>{t.tapToPlay}</button>
    : phase === 'wait' ? t.waitInstructor
    : phase === 'loading' ? fmt(t.loadingClip, { name: video?.name ?? '' })
    : phase === 'ready' ? t.loadedWait
    : phase === 'done' ? t.judgingNow
    : phase === 'result' && outcome ? <ResultView t={t} marks={outcome.marks} result={outcome.result} />
    : null;
  const overlayClass = 'overlay'
    + (!joined ? ' join-overlay' : '')
    + (joined && phase === 'result' ? ' result-overlay' : '');
  const active = phase === 'playing' || phase === 'grace';
  const last = taps[taps.length - 1];

  return (
    <div className="play">
      <div className="bar">
        <span><b>{joined ? name : 'Scoring Test'}</b> · {session}</span>
        <span>{joined && last ? `${last.time.toFixed(2)}s ${sideLabel(t, last.side)} ${valueLabel(t, last.value)}` : joined ? t.phase[phase] : ''}</span>
        <span className="status">
          {joined && <><span className={'dot' + (connected ? ' on' : '')} />{connected ? t.online : t.reconnecting}</>}
          <Help t={t} sections={t.help.trainee} />
          <LangSelect lang={lang} setLang={setLang} label={t.language} />
        </span>
      </div>
      <div className="arena">
        <div className="stage">
          <video ref={videoRef} playsInline />
          {overlay && <div className={overlayClass}>{overlay}</div>}
          {joined && error && <div className="overlay">{say(t, error)}</div>}
        </div>
        <TapPanel side="chung" t={t} disabled={!active} onTap={tap} />
        <TapPanel side="hong" t={t} disabled={!active} onTap={tap} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
