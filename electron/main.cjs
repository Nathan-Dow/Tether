// Tether — Electron main process.
// Owns the frameless island window, click-through, dragging, global shortcuts,
// the foreground-window context daemon and a network-egress counter.
const path = require('node:path');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  globalShortcut,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  session,
  shell,
  Tray,
} = require('electron');
const fs = require('node:fs');
const { WindowsProbe } = require('./context/windowsProbe.cjs');
const { ContextDaemon } = require('./context/daemon.cjs');
const { Evaluator } = require('./ai/evaluator.cjs');
const { SessionStore } = require('./analytics/store.cjs');
const { SessionRecorder } = require('./analytics/recorder.cjs');
const { LabelStore } = require('./analytics/labels.cjs');
const { sessionReport, dayReport } = require('./analytics/metrics.cjs');
const { googleCalendarUrl, icsFile, icsFileName } = require('./analytics/calendar.cjs');
const { ResumeTracker, buildSnapshot, resumePrompt, writeNote } = require('./analytics/resume.cjs');
const ollama = require('./ai/ollama.cjs');
const stt = require('./voice/stt.cjs');
const { extractIntent } = require('./voice/intent.cjs');

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged && process.env.TETHER_PROD !== '1';

// Test harness (dev only): TETHER_FAKE_MIC=<file.wav> makes Chromium use the
// WAV file as the microphone, so voice input can be tested without speaking.
if (isDev && process.env.TETHER_FAKE_MIC) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.TETHER_FAKE_MIC);
}
const DEV_URL = 'http://127.0.0.1:5173';

// The window is a fixed transparent canvas; the island animates inside it.
// Extra room around the 420x180 max island leaves space for the glow.
const WIN_W = 500;
const WIN_H = 250;
// The collapsed pill inside that window (Island.jsx: 420x54, 10px from the top).
const PILL = { x: (WIN_W - 420) / 2, y: 10, w: 420, h: 54 };

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

// ---------------------------------------------------------------------------
// Tray: the island has no taskbar button, so this is where Tether lives.
// ---------------------------------------------------------------------------

let tray = null;

function openGoal() {
  if (!win) return;
  summon();
  win.webContents.send('shortcut', 'open-input');
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'New sprint', accelerator: 'CommandOrControl+Shift+K', click: openGoal },
    { label: 'Focus dashboard', click: openDashboard },
    { label: 'Re-centre island', click: recenter },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      // Only the installed app can register itself; in dev this would launch bare Electron.
      enabled: app.isPackaged,
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Tether', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
  tray.setToolTip('Tether');
  tray.setContextMenu(trayMenu());
  tray.on('click', openGoal);
}

// Vision Sentinel live preview (Ctrl+Alt+V): camera feed with what the
// on-device models see drawn over it. Toggles open/closed.
let visionWin = null;
function toggleVisionPreview() {
  if (visionWin) return visionWin.close();
  visionWin = new BrowserWindow({
    width: 660,
    height: 560,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Tether — Vision Sentinel',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  loadPage(visionWin, 'vision.html');
  visionWin.once('ready-to-show', () => visionWin?.show());
  visionWin.on('closed', () => {
    visionWin = null;
  });
}

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
      autoplayPolicy: 'no-user-gesture-required', // audio cues (goal set, drift)
    },
  });

  // No menu: its hidden accelerators (Ctrl+W close, Ctrl+R reload) are a
  // stage hazard, and the island handles its own shortcuts.
  win.removeMenu();
  win.setAlwaysOnTop(true, 'screen-saver');
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Transparent areas pass clicks through to whatever is underneath; the
  // renderer flips this off while the cursor is over the island itself.
  win.setIgnoreMouseEvents(true, { forward: true });
  clickThrough = true;
  watchCursor();

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

// Click-through is driven two ways: the renderer's hover events (instant)
// and a cursor poll here (the safety net). Windows' forwarded mouse events
// for an ignoring window are unreliable, so hover alone could miss an enter
// (island won't take clicks) or a leave (invisible area eats clicks).
let clickThrough = true;
let islandExpanded = false;
let cursorTimer = null;

function setClickThrough(on) {
  if (!win || on === clickThrough) return;
  clickThrough = on;
  if (on) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
}

function cursorOverPill() {
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = p.x - b.x;
  const y = p.y - b.y;
  return x >= PILL.x && x < PILL.x + PILL.w && y >= PILL.y && y < PILL.y + PILL.h;
}

function watchCursor() {
  clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    setClickThrough(!(islandExpanded || dragTimer || cursorOverPill()));
  }, 80);
}

ipcMain.on('island:interactive', (_e, interactive) => setClickThrough(!interactive));
ipcMain.on('island:expanded', (_e, expanded) => {
  islandExpanded = Boolean(expanded);
  if (islandExpanded) setClickThrough(false);
});

// Pull keyboard focus to the island (goal input). A click-through window
// can't reliably become foreground on Windows, so drop that first.
function summon() {
  if (!win) return;
  setClickThrough(false);
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

function recenter() {
  if (!win) return;
  stopDrag();
  const { x, y } = topCenter();
  // Twice on purpose: when the jump crosses into a monitor with a different
  // scale factor, the first call lands using the old monitor's scale.
  placeAt(x, y);
  placeAt(x, y);
}

ipcMain.on('island:recenter', recenter);

ipcMain.on('island:devtools', () => {
  if (!win) return;
  win.webContents.toggleDevTools();
});

// ---------------------------------------------------------------------------
// OS context daemon (Windows only for now)
// ---------------------------------------------------------------------------

let daemon = null;

// The probe only needs to be quick during a sprint; between sprints it just
// feeds the island's current-app chip.
const SPRINT_TICK_MS = Number(process.env.TETHER_TICK_MS) || 2000;
const IDLE_TICK_MS = 10_000;

function startContextDaemon() {
  if (process.platform !== 'win32') return;

  daemon = new ContextDaemon({
    probe: new WindowsProbe(),
    intervalMs: IDLE_TICK_MS,
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
    getLabels,
  });
  evaluator.on('verdict', (entry) => {
    recorder?.onVerdict(entry);
    win?.webContents.send('eval:verdict', entry);
    trackResume(entry);
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
    if (recorder?.session?.startedAt !== sprint.startedAt) resumeTracker.reset();
    recorder?.start(sprint);
    const current = daemon?.getState().current;
    if (current) recorder?.onContext(current);
  } else {
    const finished = recorder?.finish();
    if (finished) {
      lastReport = sessionReport(finished, { labels: getLabels() });
      broadcast('session:finished', lastReport);
    }
  }
  daemon?.setIntervalMs(sprint ? SPRINT_TICK_MS : IDLE_TICK_MS);
  evaluator?.setSprint(sprint);
});

// Vision Sentinel: smartphone pickups from the island's webcam sampler.
ipcMain.on('vision:phone', (_e, event) => recorder?.onPhone(event ?? {}));
ipcMain.on('vision:sample', (_e, sample) => recorder?.onVisionSample(sample ?? {}));

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
let labelStore = null;
let recorder = null;
let lastReport = null;
const HISTORY_DAYS = 30;

function startRecorder() {
  store = new SessionStore(path.join(app.getPath('userData'), 'sessions'));
  labelStore = new LabelStore(path.join(app.getPath('userData'), 'labels.json'));
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

const getLabels = () => labelStore?.all() ?? {};

ipcMain.handle('analytics:day', () => dayReport(allSessions(), { day: Date.now(), labels: getLabels() }));

// Your own "always on-task / always drift" labels, set from the dashboard.
// Every window re-reads its reports when they change.
ipcMain.handle('labels:get', () => getLabels());
ipcMain.handle('labels:set', (_e, { site, label } = {}) => {
  const labels = labelStore?.set(site, label) ?? {};
  broadcast('labels:changed', labels);
  return labels;
});
ipcMain.handle('analytics:last-session', () => lastReport);

// Any session by id: the one just finished or a saved one.
function findReport(id) {
  const saved = store?.load(id);
  if (saved) return sessionReport(saved, { labels: getLabels() });
  return lastReport?.id === id ? lastReport : null;
}

// Opening the template is the one deliberate, user-initiated trip to the
// internet: the user's own browser, with the summary they chose to share.
ipcMain.handle('calendar:google', async (_e, id) => {
  const report = findReport(id);
  if (!report) return { ok: false };
  await shell.openExternal(googleCalendarUrl(report));
  return { ok: true };
});

ipcMain.handle('calendar:ics', async (e, id) => {
  const report = findReport(id);
  if (!report) return { ok: false };
  // Attach the dialog to whichever window asked: the island or the dashboard.
  const parent = BrowserWindow.fromWebContents(e.sender) ?? win;
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
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
// Resume Flow: a welcome-back note after an interruption
// ---------------------------------------------------------------------------

const AWAY_AFTER_S = 120;
const resumeTracker = new ResumeTracker({
  minAwayMs: (Number(process.env.TETHER_RESUME_MIN) || 5) * 60_000,
});

// Off-task = a confident distraction, the desktop, or no input for 2 min.
function trackResume(entry) {
  if (recorder?.session?.mode === 'ambient') return; // Ambient Mode never pops up
  if (!recorder?.session) return;
  const idleS = powerMonitor.getSystemIdleTime();
  const away = idleS >= AWAY_AFTER_S;
  const onTask =
    !away && entry.category !== 'idle' && !(entry.isDistracted && entry.confidence >= 0.6);
  const hit = resumeTracker.update({
    at: entry.at,
    onTask,
    offSince: away ? entry.at - idleS * 1000 : entry.at,
  });
  if (hit) showResume(recorder.session, Date.now());
}

async function showResume(session, now) {
  const snapshot = buildSnapshot(session, { now, labels: getLabels() });
  const note = await writeNote(snapshot, {
    ollama,
    ready: evaluator?.health.status === 'ready',
  });
  win?.webContents.send('resume:show', { ...snapshot, ...note, prompt: resumePrompt(snapshot) });
}

ipcMain.handle('clipboard:write', (_e, text) => {
  clipboard.writeText(String(text));
  return true;
});

// ---------------------------------------------------------------------------
// Network egress counter. Anything that isn't loopback (Vite dev server,
// Ollama on :11434) counts. Not shown in the UI.
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
// Voice goal input: mic in the island, Whisper (whisper.cpp) + the local
// model in main. Audio stays in memory apart from one temp WAV per request.
// ---------------------------------------------------------------------------

const MAX_VOICE_SAMPLES = stt.SAMPLE_RATE * 20;

// Mic (voice goals) and camera (Vision Sentinel) are only for Tether's own pages.
function allowMicOnly() {
  const ours = (wc) =>
    wc === win?.webContents || wc === dashWin?.webContents || wc === visionWin?.webContents;
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const avOnly = !details.mediaTypes?.length || details.mediaTypes.every((t) => t === 'audio' || t === 'video');
    callback(permission === 'media' && avOnly && ours(wc));
  });
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission) => permission === 'media' && Boolean(wc) && ours(wc),
  );
}

ipcMain.handle('voice:status', () => stt.status());
ipcMain.handle('voice:transcribe', async (_e, samples) => {
  if (!samples?.length) return { ok: false, error: 'empty' };
  if (!stt.status().ready) return { ok: false, error: 'missing' };
  const audio = Float32Array.from(samples.length > MAX_VOICE_SAMPLES ? samples.slice(0, MAX_VOICE_SAMPLES) : samples);
  try {
    const { text, latencyMs: sttMs } = await stt.transcribe(audio);
    if (!text) return { ok: false, error: 'empty', sttMs };
    const intent = await extractIntent(text, { ollama, ready: evaluator?.health.status === 'ready' });
    return { ok: true, sttMs, ...intent };
  } catch (err) {
    console.warn('[voice] failed:', err.message);
    return { ok: false, error: 'failed' };
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Launching Tether again (e.g. the desktop shortcut) opens the goal card.
  app.on('second-instance', openGoal);

  app.whenReady().then(() => {
    if (isMac) app.dock?.hide();
    watchEgress();
    allowMicOnly();
    createWindow();
    createTray();
    startRecorder();
    startContextDaemon();
    startEvaluator();

    // Plain Ctrl+K globally would hijack editor/browser chords, so the
    // system-wide summon is Cmd/Ctrl+Shift+K. Cmd/Ctrl+K works in-island.
    globalShortcut.register('CommandOrControl+Shift+K', openGoal);
    // Voice goal: press to start talking, press again (or pause) to finish.
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (!win) return;
      summon();
      win.webContents.send('shortcut', 'voice');
    });
    globalShortcut.register('CommandOrControl+Alt+V', toggleVisionPreview);
  });

  app.on('will-quit', () => {
    stopDrag();
    clearInterval(cursorTimer);
    recorder?.finish(); // don't lose a sprint that's still running
    daemon?.stop();
    evaluator?.stop();
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => app.quit());
}
