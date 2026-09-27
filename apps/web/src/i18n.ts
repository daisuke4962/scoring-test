import { useEffect, useState } from 'react';
import type { ErrorCode, Side, TapValue } from '@scoring-test/shared';

// Every on-screen string for both pages. To add a language, copy `en`, translate it, and add it
// to DICTS and LANG_NAMES; the `Dict` type makes the compiler list anything left untranslated.
// Official WT terms (Chung, Hong, Gam-jeom) keep their romanized form in every language.

const en = {
  language: 'Language',
  close: 'Close',
  chung: 'Chung',
  hong: 'Hong',
  gamjeom: 'Gam-jeom',
  undo: 'Undo',
  connected: 'Connected',
  notConnected: 'Not connected',

  errVersion: 'This page is out of date. Reload it.',
  errSession: 'Wrong session code. Scan the QR code again.',
  errLoad: '{name}: this clip cannot be played on that phone.',

  // instructor: shell
  tabsLabel: 'Mode',
  tabAuthor: 'Make questions',
  tabRun: 'Run a test',
  clip: 'Clip',
  upload: 'Add a clip',
  uploading: 'Uploading…',
  uploadFailed: 'Upload failed: {msg}',
  clipNotice: 'Which footage to use is yours to judge: have the right to use it, and make sure the people in it are content to appear. Clips stay between this PC and the phones in the room, and are never uploaded to the internet.',

  // instructor: make questions
  markTitle: 'Mark the scoring',
  markHelp: 'Play the clip and press the buttons the moment a point is scored, as a judge would. Each press becomes a mark. Press 2 or 3 twice for a turning kick. Undo takes back the last press on that side.',
  speed: 'Speed',
  keysHelp: 'Keys (half-width input): Chung A S D = 1 2 3, F = Gam-jeom, Q = Undo. Hong J K L = 1 2 3, ; = Gam-jeom, P = Undo. Space = play or pause, arrows = one frame.',
  chooseClipFirst: 'Choose or add a clip first.',
  marks: 'Marks',
  noMarks: 'No marks yet. Play the clip and press when a point is scored.',
  colTimeShort: 'Time',
  colPoint: 'Point',
  seekHint: 'Play from 1 s before this mark',
  frameEarlier: 'One frame earlier',
  frameLater: 'One frame later',
  remove: 'Remove',
  clearMarks: 'Clear all marks',
  confirmClear: 'Remove all {n} marks from this clip?',
  saving: 'Saving…',
  saved: 'Saved',
  questions: 'Questions',
  questionsHelp: 'Made from the marks automatically: each runs from {pre} s before its first mark to {post} s after its last. Marks close together share a question.',
  qLabel: 'Q{n}',
  qMeta: '{len} s · {n} marks',
  longQuestion: 'Long question. Remove a mark to split it.',
  before: 'Before the first mark (s)',
  after: 'After the last mark (s)',
  preVary: 'Run-up varies by (s)',
  quiet: 'No scoring',
  quietHelp: 'Stretches with no scoring are listed too, so trainees also practise holding back. The run-up varies per question, so nobody can learn how long to wait.',

  // instructor: run a test
  network: 'Network',
  howPhonesConnect: 'How phones connect',
  netWifi: 'Wi-Fi router',
  netTether: 'Tethering',
  stepsWifi: [
    'Connect this PC and every phone to the same router.',
    'Turn off client isolation on the router (also called AP isolation or privacy separator). Venue and hotel Wi-Fi usually has it on.',
    'Use the 5 GHz network if the router has one.',
  ],
  stepsTether: [
    'Turn on the hotspot on your phone. On iPhone, turn off "Maximize Compatibility" to use 5 GHz.',
    "Connect this PC first, then the trainees' phones.",
    'An iPhone hotspot takes about 5 devices including this PC, so groups of 4.',
    'Keep the phone charging. Some travel SIMs and eSIMs block tethering, so check before you go abroad.',
  ],
  onIphoneHotspot: 'This PC is on an iPhone hotspot.',
  switchToTether: 'Switch to Tethering',
  join: 'Join',
  qrAlt: 'QR code to join',
  noAddress: 'No reachable address. Connect this PC to the router, then reload.',
  tryOtherNetwork: 'If phones cannot connect, try another network:',
  connecting: 'Connecting to server…',
  question: 'Question',
  wholeClip: 'Whole clip',
  marksCount: '{n} marks',
  sent: 'On phones',
  sendToPhones: 'Send to phones',
  play: 'Play',
  stop: 'Stop',
  nextQuestion: 'Next question',
  previewHint: 'Pick a question to see it here.',
  loadingMarks: 'Loading marks…',
  noMarksRun: 'This clip has no marks yet, so every press will count as extra. Mark it under "Make questions" first.',
  judging: 'Judging',
  tolerance: 'Accepted after a mark (s)',
  lead: 'Accepted before a mark (s)',
  doubleWindow: 'Turning kick: second press within (s)',
  judgingHelp: 'Applies from the next question. Phones keep taking presses for the accepted time after the clip ends.',
  trainees: 'Trainees',
  groupFull: 'Group full',
  groupN: 'group {n}',
  nextGroup: 'Next group',
  confirmNextGroup: 'Let the {n} phones go and start group {next}?',
  groupDone: 'That is the end for this group. Thank you! Hand the phone on and the next person can enter their name.',
  tapToPlay: 'Tap to start',
  nobodyYet: 'Nobody has joined yet.',
  online: 'online',
  offline: 'offline',
  ready: 'ready',
  notReady: 'not ready',
  loaded: 'loaded',
  noClip: 'no clip',
  results: 'Results',
  noResultsYet: 'Send a question. Results appear here as each phone finishes it.',
  pastQuestions: 'Question played',
  round: 'round {n}',
  peopleJudged: '{n} judged',
  saveCsv: 'Save CSV',
  agreementCol: 'Correct',
  agreement: '{n} of {total}',
  reaction: 'Median delay',
  waiting: '…',
  taps: 'Taps',
  colName: 'Name',
  colClip: 'Clip',
  colSide: 'Side',
  colValue: 'Value',
  colTime: 'Video time',
  noTaps: 'No taps yet.',

  // trainee
  enterName: 'Enter your name to join session {code}.',
  noSession: '(none)',
  openFromQr: 'Open this page from the QR code shown by the instructor.',
  yourName: 'Your name',
  readyBtn: 'Ready',
  waitInstructor: 'Waiting for the instructor…',
  loadingClip: 'Loading {name}…',
  loadedWait: 'Loaded. Waiting for play.',
  judgingNow: 'Checking your answers…',
  playFailed: 'The clip could not start: {msg}',
  cannotPlayHere: 'This clip cannot be played on this phone.',
  reconnecting: 'reconnecting',
  resultLine: '{correct} of {total} correct',
  extraLine: 'Extra presses: {n}',
  noScoring: 'No points were scored in this clip.',
  verdict: { correct: 'Correct', value: 'Wrong value', color: 'Wrong side', miss: 'Missed', extra: 'Extra' },
  phase: { join: '', wait: 'Waiting', loading: 'Loading', ready: 'Loaded', playing: 'Playing', grace: 'Still counting', done: 'Checking', result: 'Result', needsTap: 'Tap to start' },
  // help sheet, in sections so each screen can show the part that concerns it.
  help: {
    btn: 'How to use',
    title: 'How to use',
    instructor: [
      {
        h: 'Making questions',
        lines: [
          'Add a clip under "Make questions". It stays on this PC and is never uploaded anywhere.',
          'Play it and press the buttons the moment a point is scored, the way a judge would. Each press becomes a mark.',
          'Press 2 or 3 twice for a turning kick (4 or 6). Undo takes back the last press on that side.',
          'Keys: for Chung, A S D = 1 2 3 and F = Gam-jeom; for Hong, J K L and semicolon. Q and P undo. Space plays or pauses, arrow keys move one frame.',
          'Marks save by themselves. The list can jump to a mark, move it by a frame, change its value or remove it.',
          'Questions are built from the marks: from a few seconds before the first to a few seconds after the last. Marks close together share one question, and stretches with no scoring at all become questions of their own.',
        ],
      },
      {
        h: 'Running a test',
        lines: [
          'Connect this PC to the router, or turn tethering on, and check in the Network card which address the phones should use.',
          'Each trainee scans the QR code, types a name and taps Join once. That tap is also what allows the video to play, so there is no second step to forget.',
          'Wait until every phone is listed as loaded. Then pick a question, send it, and press Play.',
          'The same stretch plays here on the PC, so you can watch what the phones are showing.',
          'Phones keep taking presses for the accepted time after the clip stops, and then each one gets its own result.',
          'Pressing Play again starts that question over as a new round. The round before it is kept.',
        ],
      },
      {
        h: 'Groups',
        lines: [
          'Next group lets the phones go: each returns to its join screen, ready to hand to the next person. The questions, the marks and the record all stay.',
          'Round numbers start again for each group, so group 3 round 2 reads as it happened.',
        ],
      },
      {
        h: 'Results',
        lines: [
          'For every scoring moment: how many trainees got it right. For every trainee: correct, wrong value, wrong side, missed, extra presses, and the median delay.',
          'The picker lists every play of the session, so an earlier question can be opened again at any point.',
          'Save CSV writes one row per trainee per play. The same record is written to a file as the session happens, so a closed window or a crash loses nothing.',
        ],
      },
      {
        h: 'Settings',
        lines: [
          'Judging: how long before a mark a press starts to count, how long after it still counts, and how close together two presses have to be to mean a turning kick.',
          'Questions: how long to play before the first mark, how much that varies from one question to the next, and how long to keep playing after the last mark. The variation is fixed per question, so the same question always opens the same way, but nobody learns how long to wait.',
        ],
      },
    ],
    trainee: [
      {
        h: 'On the phone',
        lines: [
          'Type your name and tap Join. That one tap also allows the video to play.',
          'The clip plays only the part you are being asked about. It can begin moments before a point is scored, on purpose: in a real match you never know when one is coming.',
          'Tap the points as you see them: 1, 2, 3 for each athlete. Press 2 or 3 twice for a turning kick, Gam-jeom for a penalty, Undo to take back your last press on that side.',
          'Presses still count for a moment after the video stops, so a point scored near the end is judged as fairly as one in the middle.',
          'Your result appears by itself once it has been checked.',
        ],
      },
    ],
  },
};

export type Dict = typeof en;

const ja: Dict = {
  language: '表示言語',
  close: '閉じる',
  chung: 'Chung 青',
  hong: 'Hong 赤',
  gamjeom: 'カムジョム',
  undo: '取り消し',
  connected: '接続中',
  notConnected: '未接続',

  errVersion: 'このページは古い版です。再読み込みしてください。',
  errSession: 'セッション番号が違います。QRコードを読み直してください。',
  errLoad: '{name}：この動画はそのスマホで再生できません。',

  tabsLabel: '画面',
  tabAuthor: '問題を作る',
  tabRun: '出題する',
  clip: '動画',
  upload: '動画を取り込む',
  uploading: 'アップロード中…',
  uploadFailed: 'アップロードに失敗しました：{msg}',
  clipNotice: 'どの動画を使うかはお使いになる方の判断でお願いします。使う権利があるもので、映っている人の了解が取れているものを。動画はこのパソコンとその場のスマホの間だけで流れ、インターネットには上がりません。',

  markTitle: '得点の印付け',
  markHelp: '動画を再生し、得点が入った瞬間に副審と同じようにボタンを押します。押した瞬間が印になります。回転蹴りは2か3を二回押します。「取り消し」はその側の直前の入力を戻します。',
  speed: '再生速度',
  keysHelp: 'キー操作（半角入力）：Chung A S D = 1 2 3、F = カムジョム、Q = 取り消し。Hong J K L = 1 2 3、; = カムジョム、P = 取り消し。スペース = 再生／一時停止、矢印 = 1コマ移動。',
  chooseClipFirst: '先に動画を選ぶか、取り込んでください。',
  marks: '印',
  noMarks: 'まだ印はありません。動画を再生して、得点が入った時に押してください。',
  colTimeShort: '時刻',
  colPoint: '点',
  seekHint: 'この印の1秒前から再生',
  frameEarlier: '1コマ前へ',
  frameLater: '1コマ後へ',
  remove: '削除',
  clearMarks: '印をすべて消す',
  confirmClear: 'この動画の印{n}件をすべて消しますか？',
  saving: '保存中…',
  saved: '保存済み',
  questions: '問題',
  questionsHelp: '印から自動で作られます。最初の印の{pre}秒前から最後の印の{post}秒後までが1問です。近い印は同じ問題にまとまります。',
  qLabel: '第{n}問',
  qMeta: '{len}秒・印{n}件',
  longQuestion: '長い問題です。印を消すと分かれます。',
  before: '最初の印の前（秒）',
  after: '最後の印の後（秒）',
  preVary: '前の長さのばらつき（秒）',
  quiet: '得点なし',
  quietHelp: '得点の入らない区間も問題として並びます。押さない練習になります。前の長さは問題ごとに変わるので、待つ時間は読めません。',

  network: 'ネットワーク',
  howPhonesConnect: 'スマホの接続方法',
  netWifi: 'Wi-Fiルータ',
  netTether: 'テザリング',
  stepsWifi: [
    'このパソコンと全員のスマホを同じルータに繋ぎます。',
    'ルータの「端末同士の通信を遮断する設定」をオフにします（プライバシーセパレーター、ネットワーク分離などの名前です）。会場やホテルのWi-Fiはたいていオンになっています。',
    'ルータに5GHzがあれば、そちらを使います。',
  ],
  stepsTether: [
    'スマホのテザリングをオンにします。iPhoneは「互換性を優先」をオフにすると5GHzになります。',
    'このパソコンを先に繋ぎ、そのあと受講者のスマホを繋ぎます。',
    'iPhoneのテザリングはこのパソコンを含めて約5台までなので、1組4人です。',
    'スマホは充電しながら使います。海外の旅行用SIMやeSIMではテザリングが使えない場合があるので、出発前に確認してください。',
  ],
  onIphoneHotspot: 'このパソコンはiPhoneのテザリングに繋がっています。',
  switchToTether: 'テザリングに切り替える',
  join: '参加',
  qrAlt: '参加用QRコード',
  noAddress: '繋がるアドレスがありません。このパソコンをルータに繋いでから再読み込みしてください。',
  tryOtherNetwork: 'スマホが繋がらない時は、別のネットワークを試してください：',
  connecting: 'サーバーに接続しています…',
  question: '出題',
  wholeClip: '動画全体',
  marksCount: '印{n}件',
  sent: '配信済み',
  sendToPhones: 'スマホに送る',
  play: '再生',
  stop: '停止',
  nextQuestion: '次の問題',
  previewHint: '問題を選ぶとここに映ります。',
  loadingMarks: '印を読み込み中…',
  noMarksRun: 'この動画にはまだ印がないので、押した分はすべて押しすぎになります。先に「問題を作る」で印を付けてください。',
  judging: '判定',
  tolerance: '印のあとの許容（秒）',
  lead: '印の前の許容（秒）',
  doubleWindow: '回転の二回押しの間隔（秒）',
  judgingHelp: '次の問題から反映されます。動画が終わった後も、許容の秒数だけ入力を受け付けます。',
  trainees: '受講者',
  groupFull: '満員',
  groupN: '第{n}組',
  nextGroup: '次の組',
  confirmNextGroup: '接続中の{n}台を解放して、第{next}組を始めますか？',
  groupDone: 'この組は終わりです。お疲れさまでした。次の方はスマホを受け取って名前を入れてください。',
  tapToPlay: 'タップして再生',
  nobodyYet: 'まだ誰も参加していません。',
  online: '接続中',
  offline: '切断',
  ready: '準備完了',
  notReady: '準備前',
  loaded: '読込済',
  noClip: '動画なし',
  results: '結果',
  noResultsYet: '問題を送ると、各スマホで終わった順にここへ結果が出ます。',
  pastQuestions: '出題した問題',
  round: '{n}回目',
  peopleJudged: '{n}人',
  saveCsv: 'CSVで保存',
  agreementCol: '正解',
  agreement: '{total}人中{n}人',
  reaction: '反応（中央値）',
  waiting: '…',
  taps: '入力',
  colName: '名前',
  colClip: '動画',
  colSide: '選手',
  colValue: '値',
  colTime: '再生位置',
  noTaps: 'まだ入力はありません。',

  enterName: '名前を入れて、セッション {code} に参加してください。',
  noSession: '（なし）',
  openFromQr: '講師が表示しているQRコードからこのページを開いてください。',
  yourName: '名前',
  readyBtn: '準備OK',
  waitInstructor: '講師の開始を待っています…',
  loadingClip: '{name} を読み込み中…',
  loadedWait: '読み込み完了。再生を待っています。',
  judgingNow: '判定しています…',
  playFailed: '動画を開始できませんでした：{msg}',
  cannotPlayHere: 'この動画はこのスマホで再生できません。',
  reconnecting: '再接続中',
  resultLine: '{total}件中{correct}件正解',
  extraLine: '押しすぎ：{n}回',
  noScoring: 'この問題では得点は入っていません。',
  verdict: { correct: '正解', value: '値違い', color: '色違い', miss: '見逃し', extra: '押しすぎ' },
  phase: { join: '', wait: '待機中', loading: '読込中', ready: '準備完了', playing: '再生中', grace: '受付中', done: '判定中', result: '結果', needsTap: 'タップして再生' },
  help: {
    btn: '使い方',
    title: '使い方',
    instructor: [
      {
        h: '問題を作る',
        lines: [
          '「問題を作る」で動画を取り込みます。動画はこのパソコンに置かれるだけで、どこにも上がりません。',
          '再生して、得点が入った瞬間に、審判と同じようにボタンを押します。押した記録がそのまま問題の下書きになります。',
          '2 か 3 を二回続けて押すと回転技（4 か 6）になります。取り消しは、その色の直前の一回を戻します。',
          'キー: Chung は A S D が 1 2 3、F がカムジョム。Hong は J K L とセミコロン。取り消しは Q と P。スペースで再生と一時停止、矢印キーで一コマ動きます。',
          '記録は自動で保存されます。一覧から、その場面へ飛ぶ、一コマ動かす、点数を変える、消すことができます。',
          '問題は記録から自動で作られます。最初の記録の数秒前から、最後の記録の数秒後まで。近い記録はひとつの問題にまとまり、得点の入らない区間も問題になります。',
        ],
      },
      {
        h: '出題する',
        lines: [
          'このパソコンをルータにつなぐか、テザリングを入れます。スマホがどのアドレスを使えばよいかは「ネットワーク」の欄で確かめられます。',
          '受講者は QR を読み、名前を入れて「参加」を一回押します。このタップが動画の再生許可も兼ねているので、二度目の操作は要りません。',
          '全員のスマホが準備完了になるまで待ってから、問題を選び、送って、再生します。',
          '同じ区間がこのパソコンでも再生されるので、スマホに出ているものを見ながら進められます。',
          'スマホは動画が止まったあとも、許容時間のあいだ押しを受け付けます。そのあと一人ずつ結果が出ます。',
          'もう一度再生すると、その問題は新しい回として始まります。前の回の記録は残ります。',
        ],
      },
      {
        h: '組を入れ替える',
        lines: [
          '「次の組」でスマホを解放します。それぞれが参加画面に戻るので、次の人にそのまま渡せます。問題も記録も残ります。',
          '回数は組ごとに数え直されるので、3組目の2回目がそのまま読めます。',
        ],
      },
      {
        h: '結果',
        lines: [
          '得点の場面ごとに、何人が正しく押せたか。受講者ごとに、正解・値違い・色違い・見逃し・押しすぎと、遅れの中央値。',
          '一覧にはそのセッションの全ての再生が並ぶので、前の問題をいつでも見返せます。',
          'CSV では、一回の再生につき受講者一人が一行になります。同じ記録はセッションの進行に合わせてファイルにも書かれるので、窓を閉じても落ちても失われません。',
        ],
      },
      {
        h: '設定',
        lines: [
          '判定: 得点の何秒前から押しを数えるか、何秒後まで数えるか、二回の押しがどれだけ近ければ回転技とみなすか。',
          '問題: 最初の得点までどれだけ再生するか、その長さを問題ごとにどれだけばらつかせるか、最後の得点のあとどれだけ続けるか。ばらつきは問題ごとに固定なので、同じ問題はいつも同じように始まりますが、待ち時間は覚えられません。',
        ],
      },
    ],
    trainee: [
      {
        h: 'スマホでの使い方',
        lines: [
          '名前を入れて「参加」を押します。このタップが動画の再生許可も兼ねています。',
          '動画は問われている区間だけが流れます。始まってすぐ得点が入ることもあります。試合でもそうだからで、いつ来るか分からない状態が練習になります。',
          '得点が見えたら押します。選手ごとに 1・2・3。2 か 3 を二回続けて押すと回転技、カムジョムは反則、取り消しはその色の直前の一回を戻します。',
          '動画が止まったあとも少しのあいだ押しは数えられます。終わり際の得点も、途中の得点と同じように判定されます。',
          '判定が終わると、結果が自動で出ます。',
        ],
      },
    ],
  },
};

const DICTS = { en, ja } satisfies Record<string, Dict>;
export type Lang = keyof typeof DICTS;
export const LANG_NAMES: Record<Lang, string> = { en: 'English', ja: '日本語' };

const STORAGE_KEY = 'st.lang';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && Object.hasOwn(DICTS, v)) return v as Lang;
  } catch { /* storage blocked: fall back to English */ }
  return 'en';
}

/** Current language (English by default, remembered per device) and its dictionary. */
export function useLang() {
  const [lang, setLangState] = useState<Lang>(loadLang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* not remembered */ }
  }
  return { lang, setLang, t: DICTS[lang] as Dict };
}

/** Fill `{name}` placeholders. Unknown placeholders are left as they are. */
export function fmt(s: string, vars: Record<string, string | number> = {}): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

// Messages are kept as a key plus values, not as finished text, so they follow a language switch.
type StrKey = { [K in keyof Dict]: Dict[K] extends string ? K : never }[keyof Dict];
export interface Msg { key: StrKey; vars?: Record<string, string | number> }
export const say = (t: Dict, m: Msg) => fmt(t[m.key], m.vars);

export function serverError(code: ErrorCode, name?: string): Msg {
  if (code === 'version') return { key: 'errVersion' };
  if (code === 'session') return { key: 'errSession' };
  return { key: 'errLoad', vars: { name: name ?? '' } };
}

export const sideLabel = (t: Dict, s: Side) => (s === 'chung' ? t.chung : t.hong);
export const valueLabel = (t: Dict, v: TapValue) => (v === 'gj' ? t.gamjeom : v === 'undo' ? t.undo : String(v));
