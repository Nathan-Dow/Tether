const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { sessionReport, dayReport, siteOf } = require('../electron/analytics/metrics.cjs');
const { buildSession, demoSessions } = require('./fixtures/sessions.cjs');
const { SessionRecorder } = require('../electron/analytics/recorder.cjs');
const { SessionStore } = require('../electron/analytics/store.cjs');

const MIN = 60_000;
const START = new Date(2026, 9, 10, 9, 0, 0).getTime();
const session = (durationMin, phases, seed = 7) =>
  buildSession({ id: 't', goal: 'Finish the auth refactor', start: START, durationMin, phases, seed });

test('pure focus: high CFI and flow, all deep work, no friction', () => {
  const r = sessionReport(session(25, [['work', 25]]));
  assert.ok(r.cfi >= 85, `cfi ${r.cfi}`);
  assert.ok(r.flowScore >= 90, `flow ${r.flowScore}`);
  assert.equal(r.totals.driftMs, 0);
  assert.equal(r.frictionDebtMs, 0);
  assert.ok(r.deepWorkMs >= 24 * MIN);
  assert.equal(r.timeline.length, 25);
  assert.ok(r.timeline.every((b) => b.state === 'focus'));
});

test('thrash: VS Code <-> X within 90s tanks CFI and is flagged', () => {
  const r = sessionReport(session(15, [['thrash', 15]]));
  assert.equal(r.cfi, 0);
  assert.equal(r.velocity, 'thrashing');
  assert.ok(r.cfiWindows[0].thrash);
  assert.ok(r.cfiWindows[0].examples[0].includes('X'), r.cfiWindows[0].examples[0]);
  assert.equal(r.deepWorkMs, 0);
});

test('rabbit hole: duration, type, site and return are captured', () => {
  const r = sessionReport(session(30, [['work', 15], ['drift', 10, 0], ['work', 5]]));
  const holes = r.episodes.filter((e) => e.kind === 'social');
  assert.equal(holes.length, 1);
  assert.equal(holes[0].durationMs, 10 * MIN);
  assert.deepEqual(holes[0].sites, ['YouTube']);
  assert.equal(holes[0].returnedToGoal, true);
  assert.equal(r.frictionDebtMs, 10 * MIN);
  assert.equal(r.leaderboard[0].site, 'YouTube');
  assert.ok(r.timeline.slice(15, 25).every((b) => b.state === 'drift'));
});

test('informational tangent is typed from the model verdict', () => {
  const r = sessionReport(session(20, [['work', 10], ['drift', 6, 5], ['work', 4]]));
  assert.equal(r.episodes[0].kind, 'informational');
  assert.deepEqual(r.episodes[0].sites, ['Wikipedia']);
});

test('debugger loop: long error-titled terminal <-> search bouncing', () => {
  const r = sessionReport(session(20, [['work', 5], ['debug', 10], ['work', 5]]));
  const loops = r.episodes.filter((e) => e.kind === 'debugging');
  assert.equal(loops.length, 1);
  assert.ok(loops[0].durationMs >= 9 * MIN, `${loops[0].durationMs}`);
  assert.ok(r.timeline.slice(6, 14).some((b) => b.state === 'debug'));
});

test('segments the evaluator never judged fall back to rules', () => {
  const s = session(10, [['work', 5], ['drift', 5, 1]]);
  s.verdicts = []; // e.g. Ollama was down and evaluator never ran
  const r = sessionReport(s);
  assert.ok(r.totals.driftMs >= 5 * MIN - 1);
  assert.equal(r.leaderboard[0].site, 'Reddit');
});

test('idle time is excluded from active time and breaks deep work', () => {
  const r = sessionReport(session(20, [['work', 4], ['idle', 10], ['work', 6]]));
  assert.equal(r.totals.idleMs, 10 * MIN);
  assert.equal(r.totals.activeMs, 10 * MIN);
  assert.equal(r.deepWorkMs, 6 * MIN); // the 4-minute stretch is too short
});

test('demo day: three sprints and one ambient session today, and an upward trend', () => {
  const day = new Date(2026, 9, 10, 18, 0).getTime();
  const rep = dayReport(demoSessions(day), { day });
  assert.equal(rep.sessions.length, 4);
  assert.equal(rep.sessions.filter((s) => s.mode === 'ambient').length, 1);
  assert.ok(rep.kpis.flowScore > 0 && rep.kpis.flowScore <= 100);
  assert.ok(rep.kpis.flowTrend > 0, `trend ${rep.kpis.flowTrend}`);
  assert.ok(rep.kpis.deepWorkMs > 60 * MIN);
  assert.ok(rep.kpis.frictionDebtMs > 0);
  assert.ok(rep.leaderboard.length >= 3);
  assert.ok(rep.episodes.some((e) => e.kind === 'debugging'));
});

test('siteOf picks the site out of browser titles', () => {
  const b = (label) => ({ category: 'browser', app: 'Google Chrome', label });
  assert.equal(siteOf(b('Lofi hip hop radio - YouTube')), 'YouTube');
  assert.equal(siteOf(b('Home / X')), 'X');
  assert.equal(siteOf(b('Mechanical keyboards | Shopee Philippines')), 'Shopee Philippines');
  assert.equal(siteOf({ category: 'chat', app: 'Discord', label: 'Discord' }), 'Discord');
});

test('recorder: extends, splits, marks away, and saves via the store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tether-test-'));
  const store = new SessionStore(dir);
  let idle = 0;
  const rec = new SessionRecorder({ store, getIdleSeconds: () => idle });
  const code = { app: 'VS Code', label: 'VS Code', title: 'a.ts', category: 'editor' };
  const yt = { app: 'Google Chrome', label: 'YouTube', title: 'YouTube', category: 'browser' };

  rec.start({ goal: 'g', durationMin: 25, startedAt: START });
  rec.onContext(code, START);
  rec.onContext(code, START + 10_000);
  rec.onContext(yt, START + 20_000);
  idle = 300;
  rec.onContext(yt, START + 30_000);
  idle = 0;
  rec.onVerdict({ at: START + 25_000, key: 'Google Chrome|YouTube', isDistracted: true, confidence: 0.9, driftType: 'social', source: 'model', latencyMs: 400, reason: 'x' });
  const saved = rec.finish(START + 60_000);

  assert.deepEqual(saved.segments.map((s) => s.label), ['VS Code', 'YouTube', 'Away']);
  assert.equal(saved.segments[0].end, START + 20_000);
  assert.equal(saved.endedAt, START + 60_000);
  assert.equal(store.list().length, 1);
  assert.equal(store.load(saved.id).verdicts.length, 1);
  store.clear();
  assert.equal(store.list().length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
