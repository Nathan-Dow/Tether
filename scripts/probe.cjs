// `npm run probe` — prints what the context daemon sees, without Electron.
// Switch between apps to watch it update. Ctrl+C to quit.
const { WindowsProbe } = require('../electron/context/windowsProbe.cjs');
const { ContextDaemon } = require('../electron/context/daemon.cjs');

if (process.platform !== 'win32') {
  console.error('The context probe currently supports Windows only.');
  process.exit(1);
}

const intervalMs = Number(process.env.TETHER_TICK_MS) || 2000;
const daemon = new ContextDaemon({ probe: new WindowsProbe(), intervalMs, appsEveryMs: 10_000 });

let lastAppsAt = 0;
daemon.on('update', (state, changed) => {
  const c = state.current;
  const secs = Math.round(state.focusedForMs / 1000);
  const tag = changed ? '→' : ' ';
  const err = c.errorSignal ? '  [error signal]' : '';
  console.log(`${tag} [${c.category}] ${c.app} :: ${c.label}  (${secs}s)${err}`);

  if (state.openWindows.length && Date.now() - lastAppsAt > 10_000) {
    lastAppsAt = Date.now();
    console.log(`  open windows: ${state.openWindows.map((w) => w.label).join(' | ')}`);
  }
});
daemon.on('probe-error', (err, n) => console.warn(`  ! probe error (${n}): ${err.message}`));

console.log(`Sampling foreground window every ${intervalMs}ms…`);
daemon.start();

process.on('SIGINT', () => {
  daemon.stop();
  const dwell = daemon.getState().dwell;
  console.log('\nDwell time (s):');
  for (const [app, ms] of Object.entries(dwell).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${app.padEnd(28)} ${Math.round(ms / 1000)}`);
  }
  process.exit(0);
});
