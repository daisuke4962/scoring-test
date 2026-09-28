// Instructor-side server.
// Serves the web app, keeps clips, marks and judging settings on disk, relays commands and
// presses over WebSocket, and judges each phone as soon as it finishes a question.
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { createSocket } from 'node:dgram';
import { safeFileName, withSuffix } from './filename.ts';
import {
  DEFAULT_SETTINGS, PROTOCOL_VERSION, judge, normalize,
  type Attempt, type ClientMessage, type JoinAddress, type JudgeSettings, type Mark, type Question,
  type ResultMessage, type ServerMessage, type Tap, type TapValue, type TraineeInfo, type VideoInfo,
} from '@scoring-test/shared';

const PORT = Number(process.env.PORT || 8787);
// Bundled into the desktop app there is no import.meta, and no need for one: everything the
// packaged program uses comes from the environment below.
const HERE = import.meta.url ? dirname(fileURLToPath(import.meta.url)) : process.cwd();
const ROOT = join(HERE, '..', '..', '..');
// The packaged desktop app passes these in: its own copy of the web files, and a data folder
// that survives an update. Run from the source tree and everything lands where it always did.
const WEB_DIST = process.env.ST_WEB_DIST || join(ROOT, 'apps', 'web', 'dist');
const DATA_DIR = process.env.ST_DATA_DIR || join(ROOT, 'data');
const VIDEO_DIR = join(DATA_DIR, 'videos');
const MARKS_DIR = join(DATA_DIR, 'marks');
const SESSION_DIR = join(DATA_DIR, 'sessions');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
// Shown on the instructor's screen, and the number the updater compares. The packaged app
// knows its own; run from source, the desktop package's number stands in.
const APP_VERSION = process.env.ST_APP_VERSION
  || readJson<{ version?: string }>(join(ROOT, 'apps', 'desktop', 'package.json'), {}).version
  || 'dev';
for (const dir of [VIDEO_DIR, MARKS_DIR, SESSION_DIR]) mkdirSync(dir, { recursive: true });

// A 4-digit session code: phones must present it to join.
const SESSION = String(Math.floor(1000 + Math.random() * 9000));

// ---------- stored data ----------
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

// Judging settings stay within sensible bounds whatever a page sends.
const LIMITS: Record<keyof JudgeSettings, [number, number]> = {
  tolerance: [0.3, 2], lead: [0, 1], doubleWindow: [0.3, 2], pre: [1, 15], preVary: [0, 10], post: [2, 15],
};
function cleanSettings(raw: Partial<JudgeSettings> | null | undefined): JudgeSettings {
  const out: JudgeSettings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(LIMITS) as (keyof JudgeSettings)[]) {
    const v = raw?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], v));
  }
  return out;
}
let settings = cleanSettings(readJson<Partial<JudgeSettings>>(SETTINGS_FILE, {}));

const POINT_VALUES = [1, 2, 3, 4, 6];
/** Keep only well-formed marks: files on disk may be old or edited by hand. */
function cleanMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m): Mark[] => {
    if (!m || typeof m.id !== 'string' || typeof m.t !== 'number' || !Number.isFinite(m.t) || m.t < 0) return [];
    if (m.side !== 'chung' && m.side !== 'hong') return [];
    if (m.kind === 'gj') return [{ id: m.id, t: m.t, side: m.side, kind: 'gj', points: [1] }];
    const points = Array.isArray(m.points) ? m.points.filter((p: unknown) => POINT_VALUES.includes(p as number)) : [];
    return points.length ? [{ id: m.id, t: m.t, side: m.side, kind: 'pt', points }] : [];
  });
}

interface MarksFile { duration: number | null; marks: Mark[] }
const isVideo = (id: unknown): id is string => typeof id === 'string' && listVideos().some(v => v.id === id);
// Only ever called with the name of a clip that exists, so it cannot point outside MARKS_DIR.
const marksPath = (videoId: string) => join(MARKS_DIR, videoId + '.json');
function readMarks(videoId: string): MarksFile {
  const f = readJson<Partial<MarksFile>>(marksPath(videoId), {});
  const duration = typeof f.duration === 'number' && Number.isFinite(f.duration) ? f.duration : null;
  return { duration, marks: cleanMarks(f.marks) };
}

// ---------- session state ----------
interface TraineeConn extends TraineeInfo { ws: WebSocket | null }
const trainees = new Map<string, TraineeConn>();
const instructors = new Set<WebSocket>();
let current: Question | null = null;                // the question the phones have loaded
const tapsBy = new Map<string, Tap[]>();            // each phone's presses for `current`
const results = new Map<string, ResultMessage>();   // each phone's result for `current`, once judged
const attempts: Attempt[] = [];                     // every play of this session, in order
let currentAttempt: Attempt | null = null;
let group = 1;                                      // 20 people go through in groups of 4 or 5
const STARTED = new Date();
// Local time in the name, so the file is easy to find later; the time inside stays unambiguous.
const STAMP = new Date(STARTED.getTime() - STARTED.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
const SESSION_FILE = join(SESSION_DIR, `${STAMP}-${SESSION}.json`);

/** Keep the session on disk as it happens, so a crash or a closed window loses nothing. */
function saveSession() {
  try {
    writeFileSync(SESSION_FILE, JSON.stringify({ session: SESSION, startedAt: STARTED.toISOString(), attempts }, null, 2));
  } catch (err) {
    console.error('could not save the session record:', err);
  }
}

function listVideos(): VideoInfo[] {
  return readdirSync(VIDEO_DIR)
    .filter(f => ['.mp4', '.m4v', '.mov', '.webm'].includes(extname(f).toLowerCase()))
    .map(f => ({ id: f, url: '/videos/' + encodeURIComponent(f), name: f, size: statSync(join(VIDEO_DIR, f)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Which local address would the OS actually use to reach another network?
// A UDP "connect" sends no packets and needs no internet — it just consults the routing table.
// Without this, a virtual adapter (VirtualBox, VMware, WSL) can sit ahead of the real Wi-Fi
// address and the QR code points somewhere the phone cannot reach.
function detectPrimaryIPv4(): Promise<string | null> {
  return new Promise(resolve => {
    let done = false;
    const s = createSocket('udp4');
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      try { s.close(); } catch { /* already closed */ }
      resolve(v);
    };
    s.on('error', () => finish(null));
    setTimeout(() => finish(null), 500);
    try {
      s.connect(53, '8.8.8.8', () => {
        try { finish(s.address().address); } catch { finish(null); }
      });
    } catch { finish(null); }
  });
}

// Found once at startup, at the bottom of this file. Deliberately not a top-level await: this
// file is also bundled into the desktop app, whose module format has no room for one.
let PRIMARY_IP: string | null = null;

/** Reachable IPv4 addresses, the routable one first. Link-local (169.254.x) is never reachable. */
function lanCandidates(): { address: string; label: string; primary: boolean }[] {
  const out: { address: string; label: string; primary: boolean }[] = [];
  for (const [label, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      out.push({ address: a.address, label, primary: a.address === PRIMARY_IP });
    }
  }
  out.sort((x, y) => Number(y.primary) - Number(x.primary));
  return out;
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcastInstructors(msg: ServerMessage) { for (const ws of instructors) send(ws, msg); }
function broadcastTrainees(msg: ServerMessage) { for (const t of trainees.values()) if (t.ws) send(t.ws, msg); }
function publicTrainees(): TraineeInfo[] {
  return [...trainees.values()].map(({ ws, ...t }) => t);
}
function pushTrainees() { broadcastInstructors({ type: 'trainees', list: publicTrainees() }); }

async function joinAddresses(): Promise<JoinAddress[]> {
  const list = lanCandidates();
  return Promise.all(list.map(async c => {
    const url = `http://${c.address}:${PORT}/trainee/?s=${SESSION}`;
    return { ...c, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 640 }) };
  }));
}

async function sendInfo(ws: WebSocket) {
  send(ws, { type: 'info', session: SESSION, appVersion: APP_VERSION, addresses: await joinAddresses(), videos: listVideos(), settings, current, group });
}

/** What phones get for a question: the clip and where to play it, but not the marks. */
function loadMessage(q: Question): ServerMessage | null {
  const video = listVideos().find(v => v.id === q.videoId);
  return video ? { type: 'load', video, question: { id: q.id, start: q.start, end: q.end }, tolerance: settings.tolerance } : null;
}

function cleanQuestion(q: Question | undefined): Question | null {
  if (!q || typeof q.id !== 'string' || !isVideo(q.videoId)) return null;
  const start = Number(q.start), end = Number(q.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { id: q.id, videoId: q.videoId, start, end, marks: cleanMarks(q.marks) };
}

/** Start the record of a play. Pressing Play again on the same question opens the next round. */
function startAttempt(question: Question): Attempt {
  const round = attempts.filter(a => a.question.id === question.id && a.group === group).length + 1;
  const attempt: Attempt = { id: `a${attempts.length + 1}`, question, round, group, at: Date.now(), results: [] };
  attempts.push(attempt);
  currentAttempt = attempt;
  broadcastInstructors({ type: 'attempt', attempt });
  saveSession();
  return attempt;
}

/** Judge one phone's presses for the current question, once, and tell that phone and the instructor. */
function judgeTrainee(traineeId: string) {
  const tr = trainees.get(traineeId);
  if (!current || !tr || results.has(traineeId)) return;
  const taps = tapsBy.get(traineeId) ?? [];
  const inputs = normalize(taps, settings.doubleWindow);
  const msg: ResultMessage = {
    type: 'result', questionId: current.id, traineeId, name: tr.name,
    marks: current.marks, result: judge(current.marks, inputs, settings),
  };
  console.log(`  judged ${tr.name}: ${msg.result.counts.correct}/${current.marks.length} correct, ${msg.result.counts.extra} extra, from ${taps.length} presses`);
  results.set(traineeId, msg);
  if (tr.ws) send(tr.ws, msg);
  // A phone can finish a question the instructor never pressed Play for; record that too.
  const attempt = currentAttempt?.question.id === current.id ? currentAttempt : startAttempt(current);
  attempt.results.push({ traineeId, name: tr.name, result: msg.result });
  broadcastInstructors({ type: 'attempt', attempt });
  saveSession();
}

const TAP_VALUES: TapValue[] = [1, 2, 3, 'gj', 'undo'];

// ---------- http ----------
const app = express();
app.use('/videos', express.static(VIDEO_DIR, { acceptRanges: true }));

// Upload a clip: raw body, file name in the query string.
app.post('/api/video', express.raw({ type: '*/*', limit: '500mb' }), (req, res) => {
  const safe = safeFileName(String(req.query.name || ''));
  const name = existsSync(join(VIDEO_DIR, safe)) ? withSuffix(safe, String(Date.now())) : safe;
  writeFileSync(join(VIDEO_DIR, name), req.body as Buffer);
  const videos = listVideos();
  for (const ws of instructors) sendInfo(ws);
  res.json({ ok: true, video: videos.find(v => v.id === name) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, session: SESSION, version: PROTOCOL_VERSION, app: APP_VERSION }));

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  // SPA-style fallbacks for the two entry pages.
  app.get(['/trainee', '/trainee/*'], (_req, res) => res.sendFile(join(WEB_DIST, 'trainee', 'index.html')));
  app.get(['/instructor', '/instructor/*'], (_req, res) => res.sendFile(join(WEB_DIST, 'instructor', 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('Web app not built yet. Run "npm run build" (or use "npm run dev" and open the Vite URL).'));
}

// ---------- websocket ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  let role: 'instructor' | 'trainee' | null = null;
  let traineeId: string | null = null;

  ws.on('message', raw => {
    let msg: ClientMessage;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    // One bad message (or a full disk) must not take the whole session down.
    try { handle(msg); } catch (err) { console.error('message failed:', err); }
  });

  function handle(msg: ClientMessage) {
    if (msg.type === 'hello') {
      if (msg.version !== PROTOCOL_VERSION) { send(ws, { type: 'error', code: 'version' }); ws.close(); return; }
      if (msg.role === 'instructor') {
        role = 'instructor'; instructors.add(ws);
        // The session so far follows the info, so a reloaded page can look back over it.
        sendInfo(ws).then(() => send(ws, { type: 'attempts', list: attempts }));
        pushTrainees();
        return;
      }
      if (msg.session !== SESSION) { send(ws, { type: 'error', code: 'session' }); ws.close(); return; }
      role = 'trainee';
      // Reconnect keeps the same id if the phone remembers it.
      const existing = msg.traineeId ? trainees.get(msg.traineeId) : undefined;
      const id = existing ? existing.id : randomBytes(4).toString('hex');
      traineeId = id;
      // A reloaded page has lost its media unlock, so it is not ready until it says so again.
      // A page that only lost the connection sends "ready" itself as soon as it is back.
      const t: TraineeConn = existing
        ? { ...existing, ws, connected: true, ready: false, name: msg.name || existing.name }
        : { id, name: msg.name || 'Trainee', connected: true, ready: false, loadedVideo: null, ws };
      trainees.set(id, t);
      send(ws, { type: 'welcome', traineeId: id, session: SESSION });
      pushTrainees();
      // A phone that joins late, or comes back after a reload, picks up the question in progress.
      if (current) {
        const load = loadMessage(current);
        if (load) send(ws, load);
        const done = results.get(id);
        if (done) send(ws, done);
      }
      return;
    }

    if (role === 'trainee' && traineeId) {
      const id = traineeId;
      const tr = trainees.get(id); if (!tr) return;
      switch (msg.type) {
        case 'ready': tr.ready = true; pushTrainees(); break;
        case 'loaded': tr.loadedVideo = msg.videoId; pushTrainees(); break;
        case 'loadError':
          tr.loadedVideo = null; pushTrainees();
          console.warn(`${tr.name}: could not load ${msg.videoId} (${msg.message})`);
          broadcastInstructors({ type: 'error', code: 'loadError', name: tr.name });
          break;
        case 'tap': {
          // Presses for another question, or after this phone's result is out, do not count.
          if (!current || msg.questionId !== current.id || results.has(id)) break;
          if ((msg.side !== 'chung' && msg.side !== 'hong') || !TAP_VALUES.includes(msg.value) || !Number.isFinite(msg.videoTime)) break;
          const list = tapsBy.get(id) ?? [];
          list.push({ side: msg.side, value: msg.value, t: msg.videoTime });
          tapsBy.set(id, list);
          broadcastInstructors({ type: 'tap', tap: { traineeId: id, name: tr.name, questionId: current.id, videoId: current.videoId, side: msg.side, value: msg.value, videoTime: msg.videoTime, wallTime: msg.wallTime } });
          break;
        }
        case 'ended':
          console.log(`  ${tr.name}: finished ${msg.questionId}`);
          broadcastInstructors({ type: 'ended', traineeId: id, questionId: msg.questionId });
          if (current && msg.questionId === current.id) judgeTrainee(id);
          break;
      }
      return;
    }

    if (role === 'instructor') {
      switch (msg.type) {
        case 'getMarks':
          if (isVideo(msg.videoId)) send(ws, { type: 'marks', videoId: msg.videoId, ...readMarks(msg.videoId) });
          break;
        case 'saveMarks': {
          if (!isVideo(msg.videoId)) break;
          const duration = typeof msg.duration === 'number' && Number.isFinite(msg.duration) ? msg.duration : null;
          const file: MarksFile = { duration, marks: cleanMarks(msg.marks) };
          writeFileSync(marksPath(msg.videoId), JSON.stringify(file, null, 2));
          // Other instructor windows follow along; the one that saved already has these marks.
          for (const other of instructors) if (other !== ws) send(other, { type: 'marks', videoId: msg.videoId, ...file });
          break;
        }
        case 'saveSettings':
          settings = cleanSettings(msg.settings);
          writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
          for (const i of instructors) sendInfo(i);
          break;
        case 'load': {
          const q = cleanQuestion(msg.question);
          const load = q && loadMessage(q);
          if (!q || !load) break;
          current = q; tapsBy.clear(); results.clear();
          for (const t of trainees.values()) t.loadedVideo = null;
          pushTrainees();
          broadcastTrainees(load);
          console.log(`sent ${q.id} to phones (${q.videoId} ${q.start.toFixed(1)}-${q.end.toFixed(1)} s, ${q.marks.length} marks)`);
          break;
        }
        case 'play': {
          if (!current || msg.questionId !== current.id) break;
          // A replay starts the question over: presses start again, and it is recorded as a new round.
          tapsBy.clear(); results.clear();
          const attempt = startAttempt(current);
          broadcastTrainees({ type: 'play', questionId: current.id });
          console.log(`play ${current.id} (round ${attempt.round})`);
          break;
        }
        case 'stop': broadcastTrainees({ type: 'stop' }); break;
        case 'nextGroup': {
          // The phones go back to the join screen, so the next few people can pick them up.
          const released = trainees.size;
          broadcastTrainees({ type: 'released' });
          trainees.clear(); tapsBy.clear(); results.clear();
          currentAttempt = null;
          group++;
          pushTrainees();
          for (const i of instructors) sendInfo(i);
          console.log(`group ${group} (released ${released} phone${released === 1 ? '' : 's'})`);
          break;
        }
      }
    }
  }

  ws.on('close', () => {
    if (role === 'instructor') instructors.delete(ws);
    if (role === 'trainee' && traineeId) {
      const t = trainees.get(traineeId);
      if (t) { t.ws = null; t.connected = false; pushTrainees(); }
    }
  });
});

// A second launch would otherwise crash with a raw Node stack trace. Say what to do instead.
// ws re-emits the http server's error, so both emitters need a handler.
function onServerError(err: NodeJS.ErrnoException) {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error('Another Scoring Test server is probably still running. Close that window and try again.');
    console.error(`To use a different port instead, in PowerShell:  $env:PORT=${PORT + 1}; .\\start.cmd\n`);
    die(err);
    return;
  }
  console.error(err);
  die(err);
}

/** The desktop app has no terminal to read, so it shows the problem in a window instead. */
function die(err: Error) {
  const fatal = (globalThis as { __stFatal?: (e: Error) => void }).__stFatal;
  if (fatal) fatal(err);
  else process.exit(1);
}

server.on('error', onServerError);
wss.on('error', onServerError);

async function start() {
  PRIMARY_IP = await detectPrimaryIPv4();
  server.listen(PORT, '0.0.0.0', () => {
    const list = lanCandidates();
    console.log(`Scoring Test server  session ${SESSION}`);
    console.log(`  instructor: http://localhost:${PORT}/instructor/`);
    for (const c of list) {
      console.log(`  trainee:    http://${c.address}:${PORT}/trainee/?s=${SESSION}   [${c.label}]${c.primary ? '  <- phones should use this one' : ''}`);
    }
    if (list.length === 0) console.log('  trainee:    no reachable address. Connect this PC to the router.');
    else if (!list.some(c => c.primary)) console.log('  (could not tell which network is the real one; pick the address on the instructor page)');
    console.log(`  videos:     ${VIDEO_DIR}`);
  });
}

start();
