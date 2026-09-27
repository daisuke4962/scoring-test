// The desktop shell. It runs the same server the source tree runs, shows the instructor page in a
// window, keeps clips and records where an update cannot touch them, and updates itself.
//
// Two things the shell has to get right, because nobody is watching a terminal any more:
// a problem must appear in a window, and the log must survive for the phone call afterwards.
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = join(app.getPath('userData'), 'data');
const LOG_FILE = join(app.getPath('userData'), 'logs', 'app.log');
// Packaged, the web files sit beside the program, outside the archive, so express can serve them.
const WEB_DIST = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '..', 'web');
const HOME = `http://localhost:${PORT}/instructor/`;

// ---------- log ----------
mkdirSync(dirname(LOG_FILE), { recursive: true });
try { if (statSync(LOG_FILE).size > 1_000_000) writeFileSync(LOG_FILE, ''); } catch { /* first run */ }

function log(...parts: unknown[]) {
  const line = new Date().toISOString() + '  ' + parts
    .map(p => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* nothing useful to do about it */ }
  process.stdout.write(line + '\n');
}
// The server writes the session to the terminal. In here, the log file is the terminal.
console.log = log;
console.error = log;

// ---------- the parts that talk to the person ----------
function both(en: string, ja: string) { return en + '\n' + ja; }

function fatal(err: NodeJS.ErrnoException) {
  log('fatal', err);
  const inUse = err.code === 'EADDRINUSE';
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'Scoring Test',
    message: inUse
      ? both(`Port ${PORT} is already in use.`, `ポート ${PORT} が使われています。`)
      : both('Scoring Test could not start.', 'Scoring Test を開始できませんでした。'),
    detail: inUse
      ? both('Another copy of Scoring Test is probably still running. Close it and start again.',
             'Scoring Test がもう一つ動いているようです。そちらを閉じてから、もう一度始めてください。')
      : both(err.message, 'くわしい内容はログに残っています（メニューの Log）。'),
    buttons: [both('Close', '閉じる')],
  });
  app.exit(1);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Scoring Test',
      submenu: [
        { label: 'Check for updates  /  更新を確認', click: () => check(true) },
        { type: 'separator' },
        { label: 'Data folder  /  データフォルダ', click: () => { shell.openPath(DATA_DIR); } },
        { label: 'Log  /  ログ', click: () => { shell.openPath(LOG_FILE); } },
        { type: 'separator' },
        { label: 'Reload  /  読み込み直す', accelerator: 'F5', click: () => { BrowserWindow.getAllWindows()[0]?.loadURL(HOME); } },
        { label: 'Developer tools', accelerator: 'F12', click: () => { BrowserWindow.getAllWindows()[0]?.webContents.toggleDevTools(); } },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { label: 'Quit  /  終了', role: 'quit' },
      ],
    },
  ]);
}

// ---------- updates ----------
// Nothing is downloaded without being asked. A seminar is exactly the wrong moment to spend the
// network on a download of this size, so "later" has to be a real answer.
let manual = false;

function updates() {
  autoUpdater.autoDownload = false;
  // No error channel here: the handler below logs those once, in one line.
  autoUpdater.logger = { info: log, warn: log, error: () => {}, debug: () => {} };

  autoUpdater.on('update-available', info => {
    log('update available', info.version);
    const answer = dialog.showMessageBoxSync({
      type: 'info',
      title: both('Update', '更新'),
      message: both(`Version ${info.version} is available. You have ${app.getVersion()}.`,
                    `新しい版 ${info.version} があります（今お使いのものは ${app.getVersion()}）。`),
      detail: both('Downloading takes a few minutes and uses the network. Just before a seminar, choose Later; it will ask again next time.',
                   'ダウンロードには数分かかり、通信を使います。セミナーの直前なら「あとで」を選んでください。次に始めたときにまた尋ねます。'),
      buttons: [both('Download', '受け取る'), both('Later', 'あとで')],
      defaultId: 0,
      cancelId: 1,
    });
    if (answer === 0) autoUpdater.downloadUpdate().catch(err => log('download failed', err));
  });

  autoUpdater.on('update-downloaded', info => {
    log('update downloaded', info.version);
    const answer = dialog.showMessageBoxSync({
      type: 'info',
      title: both('Update', '更新'),
      message: both(`Version ${info.version} is ready.`, `新しい版 ${info.version} の準備ができました。`),
      detail: both('Restarting takes a few seconds. Anything recorded so far is already saved.',
                   '再起動には数秒かかります。ここまでの記録は保存されています。'),
      buttons: [both('Restart now', '再起動して更新'), both('Later', 'あとで')],
      defaultId: 0,
      cancelId: 1,
    });
    // quitAndInstall wants the dialog out of the way before it closes the window.
    if (answer === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });

  autoUpdater.on('update-not-available', () => {
    log('no update');
    if (manual) dialog.showMessageBoxSync({
      type: 'info',
      title: both('Update', '更新'),
      message: both(`Version ${app.getVersion()} is the newest.`, `今お使いの ${app.getVersion()} が最新です。`),
      buttons: [both('Close', '閉じる')],
    });
  });

  autoUpdater.on('error', err => {
    // The message is the useful part; the stack is the updater's own and says nothing about us.
    log('update check failed:', err.message.split('\n')[0]);
    // No internet is the normal case at a venue, so this stays in the log unless it was asked for.
    if (manual) dialog.showMessageBoxSync({
      type: 'warning',
      title: both('Update', '更新'),
      message: both('Could not check for updates.', '更新を確認できませんでした。'),
      detail: both('This PC may have no internet connection right now. The app works either way.',
                   'このパソコンが今インターネットにつながっていないのかもしれません。アプリはそのまま使えます。'),
      buttons: [both('Close', '閉じる')],
    });
  });
}

function check(byHand: boolean) {
  manual = byHand;
  if (!app.isPackaged) {
    log('update check skipped (not the installed app)');
    if (byHand) dialog.showMessageBoxSync({
      type: 'info',
      title: both('Update', '更新'),
      message: both('Updates only apply to the installed app.', '更新はインストールした版でだけ動きます。'),
      buttons: [both('Close', '閉じる')],
    });
    return;
  }
  autoUpdater.checkForUpdates().catch(err => log('update check failed', err));
}

// ---------- startup ----------
/** The window must not load before the server answers, or it lands on a browser error page. */
async function waitForServer(ms = 20000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    if (Date.now() > until) return false;
    await new Promise(r => setTimeout(r, 200));
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 900, minWidth: 900, minHeight: 620,
    title: 'Scoring Test', backgroundColor: '#0f172a', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(HOME);
  // A link to anywhere else belongs in the person's own browser, not in this window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('page failed to load', code, desc, url);
    if (url.startsWith(HOME)) setTimeout(() => win.loadURL(HOME), 500);
  });
  return win;
}

async function main() {
  log(`Scoring Test ${app.getVersion()} starting  (packaged: ${app.isPackaged})`);
  log(`data: ${DATA_DIR}`);

  // The server reads these instead of working the paths out from where its own file sits.
  process.env.ST_DATA_DIR = DATA_DIR;
  process.env.ST_WEB_DIST = WEB_DIST;
  process.env.ST_APP_VERSION = app.getVersion();
  // It hands a startup failure back here, rather than ending the process without a word.
  (globalThis as { __stFatal?: (e: Error) => void }).__stFatal = fatal;

  await app.whenReady();
  Menu.setApplicationMenu(buildMenu());
  updates();

  try {
    // Bundled separately, so everything above is already in place when it starts listening.
    require('./server.cjs');
  } catch (err) {
    fatal(err as NodeJS.ErrnoException);
    return;
  }

  if (!(await waitForServer())) log('server did not answer in time; showing the window anyway');
  createWindow();

  // Late enough that the window is up, so the first thing seen is the app and not a dialog.
  setTimeout(() => check(false), 8000);
}

// ---------- one at a time ----------
// A second launch would fight the first one for the port. Show the window already open instead.
if (!app.requestSingleInstanceLock()) {
  // Worth a line: otherwise a copy that starts and vanishes leaves nothing to look at.
  log('already running; handing over to the window that is open');
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.on('window-all-closed', () => app.quit());
  main();
}
