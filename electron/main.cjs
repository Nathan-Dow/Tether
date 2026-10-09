// Tether — Electron main process.
// Owns the frameless island window, click-through, dragging, global shortcuts,
// the foreground-window context daemon and a network-egress counter.
const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  globalShortcut,
  powerMonitor,
  screen,
  session,
  shell,
} = require('electron');
const fs = require('node:fs');
const { WindowsProbe } = require('./context/windowsProbe.cjs');
const { ContextDaemon } = require('./context/daemon.cjs');
const { Evaluator } = require('./ai/evaluator.cjs');
const { SessionStore } = require('./analytics/store.cjs');
const { SessionRecorder } = require('./analytics/recorder.cjs');
const { sessionReport, dayReport } = require('./analytics/metrics.cjs');
const { demoSessions } = require('./analytics/demoDay.cjs');
const { googleCalendarUrl, icsFile, icsFileName } = require('./analytics/calendar.cjs');

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged && process.env.TETHER_PROD !== '1';
const DEV_URL = 'http://127.0.0.1:5173';

// The window is a fixed transparent canvas; the island animates inside it.
// Extra room around the 420x180 max island leaves space for the glow.
const WIN_W = 500;
const WIN_H = 250;

let win = null;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function topCenter() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  // macOS: sit on the menu-bar strip like a real Dynamic Island.
  // Windows: stay inside the work area so we never fight the taskbar.
  const area = isMac ? display.bounds : display.workArea;
  return {
    x: Math.round(area.x + (area.width - WIN_W) / 2),
    y: area.y,
  };
}

// Load one of the Vite pages (dev server or built dist/). A failed load would
// leave an empty window, so retry a few times: transient errors (dev server
// still starting, ERR_NO_BUFFER_SPACE) happen.
function loadPage(target, page) {
  const load = () =>
    isDev
      ? target.loadURL(`${DEV_URL}/${page}`)
      : target.loadFile(path.join(__dirname, '..', 'dist', page));

  let retries = 0;
  target.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED */ || retries >= 10) return;
    retries += 1;
    console.warn(`[window] ${page} failed to load (${desc}), retry ${retries}/10`);
    setTimeout(() => !target.isDestroyed() && load(), 1000);
  });
  target.webContents.on('did-finish-load', () => {
    retries = 0;
  });

  load();
}

// Send to every open window (island + dashboard).
function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// Dashboard window
// ---------------------------------------------------------------------------

let dashWin = null;

function openDashboard() {
  if (dashWin) {
    if (dashWin.isMinimized()) dashWin.restore();
    dashWin.show();
    dashWin.focus();
    return;
  }
  dashWin = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Tether — Focus Dashboard',
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    // Native window controls drawn over our own dark top bar.
    titleBarOverlay: isMac ? undefined : { color: '#09090b', symbolColor: '#a1a1aa', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  loadPage(dashWin, 'dashboard.html');
  dashWin.once('ready-to-show', () => dashWin?.show());
  dashWin.on('closed', () => {
    dashWin = null;
  });
}

ipcMain.on('dashboard:open', openDashboard);

function createWindow() {
  const { x, y } = topCenter();

  win = new BrowserWindow({
    x,
    y,
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Tether',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Transparent areas pass clicks through to whatever is underneath; the
  // renderer flips this off while the cursor is over the island itself.
  win.setIgnoreMouseEvents(true, { forward: true });

  loadPage(win, 'index.html');

  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    win = null;
  });
}

// ---------------------------------------------------------------------------
// Island IPC: click-through, focus, drag, recenter
// ---------------------------------------------------------------------------

let dragTimer = null;

function stopDrag() {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
}

// Always move with an explicit size: crossing monitors with different display
// scaling can otherwise make Windows resize the window, which throws off
// centering and leaves a big invisible click-blocking area.
function placeAt(x, y) {
  if (!win) return;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIN_W, height: WIN_H });
}

ipcMain.on('island:interactive', (_e, interactive) => {
  if (!win) return;
  if (interactive) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

// Pull keyboard focus to the island (goal input). A click-through window
// can't reliably become foreground on Windows, so drop that first.
function summon() {
  if (!win) return;
  win.setIgnoreMouseEvents(false);
  win.show();
  win.moveTop();
  win.focus();
  win.webContents.focus();
}

ipcMain.on('island:focus', summon);

// Dragging is done by polling the cursor instead of -webkit-app-region,
// which doesn't cooperate with click-through windows on Windows.
ipcMain.on('island:drag-start', () => {
  if (!win) return;
  stopDrag();
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  const offset = { x: cursor.x - wx, y: cursor.y - wy };
  dragTimer = setInterval(() => {
    if (!win) return stopDrag();
    const p = screen.getCursorScreenPoint();
    placeAt(p.x - offset.x, p.y - offset.y);
  }, 16);
});

ipcMain.on('island:drag-end', () => {
  stopDrag();
  if (!win) return;
  // Re-assert the size once the window has settled on its final monitor.
  const [x, y] = win.getPosition();
  placeAt(x, y);
});

ipcMain.on('island:recenter', () => {
  if (!win) return;
  stopDrag();
  const { x, y } = topCenter();
  // Twice on purpose: when the jump crosses into a monitor with a different
  // scale factor, the first call lands using the old monitor's scale.
  placeAt(x, y);
  placeAt(x, y);
});

ipcMain.on('island:devtools', () => {
  if (!win) return;
  win.webContents.toggleDevTools();
});

// ---------------------------------------------------------------------------
// OS context daemon (Windows only for now)
// ---------------------------------------------------------------------------

let daemon = null;

function startContextDaemon() {
  if (process.platform !== 'win32') return;

  daemon = new ContextDaemon({
    probe: new WindowsProbe(),
    intervalMs: Number(process.env.TETHER_TICK_MS) || 2000,
    // The island's own window is owned by this (main) process.
    selfPid: process.pid,
  });

  // Every sample feeds the session recorder; only focus changes go to the UI.
  daemon.on('update', (state, changed) => {
    recorder?.onContext(state.current);
    if (changed) win?.webContents.send('context:update', state);
  });
  daemon.on('probe-error', (err, failures) => {
    // Log the first failure of a streak, then stay quiet.
    if (failures === 1) console.warn('[context] probe failed:', err.message);
  });

  daemon.start();
}

ipcMain.handle('context:get', () => daemon?.getState() ?? null);

// ---------------------------------------------------------------------------
// Local AI evaluator (Ollama on loopback, rules fallback)
// ---------------------------------------------------------------------------

let evaluator = null;

function startEvaluator() {
  evaluator = new Evaluator({
    daemon,
    intervalMs: Number(process.env.TETHER_EVAL_MS) || 8000,
  });
  evaluator.on('verdict', (entry) => {
    recorder?.onVerdict(entry);
    win?.webContents.send('eval:verdict', entry);
  });
  evaluator.on('drift', (entry) => {
    recorder?.onAlert(entry);
    win?.webContents.send('eval:result', entry);
  });
  evaluator.on('health', (health) => win?.webContents.send('ai:health', health));
  evaluator.on('model-error', (err) => console.warn('[ai] model call failed:', err.message));
  evaluator.start();
}

ipcMain.on('sprint:set', (_e, sprint) => {
  if (sprint) {
    recorder?.start(sprint);
    const current = daemon?.getState().current;
    if (current) recorder?.onContext(current);
  } else {
    const finished = recorder?.finish();
    if (finished) {
      lastReport = sessionReport(finished);
      broadcast('session:finished', lastReport);
    }
  }
  evaluator?.setSprint(sprint);
});

ipcMain.on('eval:allow', (_e, key) => {
  evaluator?.allow(key);
  recorder?.onAllow(key);
});
ipcMain.handle('ai:health', () => evaluator?.health ?? null);
ipcMain.handle('eval:log', () => evaluator?.log ?? []);

// ---------------------------------------------------------------------------
// Session history + analytics (all local, in Tether's app-data folder)
// ---------------------------------------------------------------------------

let store = null;
let recorder = null;
let lastReport = null;
const HISTORY_DAYS = 30;

function startRecorder() {
  store = new SessionStore(path.join(app.getPath('userData'), 'sessions'));
  recorder = new SessionRecorder({
    store,
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
  });
}

// Saved sessions plus the sprint in progress (as of now).
function allSessions() {
  const since = Date.now() - HISTORY_DAYS * 24 * 60 * 60_000;
  const saved = store ? store.list({ since }) : [];
  const live = recorder?.session;
  if (!live) return saved;
  return [...saved.filter((s) => s.id !== live.id), { ...live, endedAt: Date.now() }];
}

ipcMain.handle('analytics:day', (_e, { demo = false } = {}) =>
  demo ? dayReport(demoSessions(), { day: Date.now() }) : dayReport(allSessions()),
);
ipcMain.handle('analytics:last-session', () => lastReport);

// Any session by id: the one just finished, a saved one, or a demo one.
function findReport(id) {
  if (lastReport?.id === id) return lastReport;
  const saved = store?.load(id) ?? demoSessions().find((s) => s.id === id);
  return saved ? sessionReport(saved) : null;
}

// Opening the template is the one deliberate, user-initiated trip to the
// internet: the user's own browser, with the summary they chose to share.
ipcMain.handle('calendar:google', async (_e, id) => {
  const report = findReport(id);
  if (!report) return { ok: false };
  await shell.openExternal(googleCalendarUrl(report));
  return { ok: true };
});

ipcMain.handle('calendar:ics', async (_e, id) => {
  const report = findReport(id);
  if (!report) return { ok: false };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save sprint to calendar',
    defaultPath: path.join(app.getPath('downloads'), icsFileName(report)),
    filters: [{ name: 'Calendar event', extensions: ['ics'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, icsFile(report));
  return { ok: true, filePath };
});
ipcMain.handle('analytics:clear', async (e) => {
  const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const { response } = await dialog.showMessageBox(parent, {
    type: 'warning',
    buttons: ['Delete history', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Clear focus history',
    message: 'Delete all recorded sprints from this computer?',
    detail: 'Window titles, verdicts and scores stored by Tether will be permanently removed.',
  });
  if (response !== 0) return false;
  store?.clear();
  lastReport = null;
  return true;
});

// ---------------------------------------------------------------------------
// Network egress counter. Anything that isn't loopback (Vite dev server,
// Ollama on :11434) counts. Not shown in the UI; kept for the offline demo.
// ---------------------------------------------------------------------------

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const netStats = { external: 0, lastHost: null };

function isExternal(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return false;
    return !LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

function watchEgress() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isExternal(details.url)) {
      netStats.external += 1;
      netStats.lastHost = new URL(details.url).hostname;
      win?.webContents.send('net:stats', { ...netStats });
    }
    callback({});
  });
}

ipcMain.handle('net:get', () => ({ ...netStats }));

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    win.showInactive();
  });

  app.whenReady().then(() => {
    if (isMac) app.dock?.hide();
    watchEgress();
    createWindow();
    startRecorder();
    startContextDaemon();
    startEvaluator();

    // Plain Ctrl+K globally would hijack editor/browser chords, so the
    // system-wide summon is Cmd/Ctrl+Shift+K. Cmd/Ctrl+K works in-island.
    globalShortcut.register('CommandOrControl+Shift+K', () => {
      if (!win) return;
      summon();
      win.webContents.send('shortcut', 'open-input');
    });
  });

  app.on('will-quit', () => {
    stopDrag();
    recorder?.finish(); // don't lose a sprint that's still running
    daemon?.stop();
    evaluator?.stop();
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => app.quit());
}
