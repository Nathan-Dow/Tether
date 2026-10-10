const test = require('node:test');
const assert = require('node:assert/strict');

const { groupOf } = require('../electron/analytics/groups.cjs');
const { sessionReport } = require('../electron/analytics/metrics.cjs');
const { buildSession } = require('./fixtures/sessions.cjs');
const { SessionRecorder } = require('../electron/analytics/recorder.cjs');
const { Evaluator } = require('../electron/ai/evaluator.cjs');

const MIN = 60_000;

test('windows fall into activity groups', () => {
  const g = (category, title, app = 'App') => groupOf({ category, app, label: title, title });
  assert.equal(g('editor', 'auth.ts - api - Visual Studio Code'), 'coding');
  assert.equal(g('terminal', 'npm test'), 'coding');
  assert.equal(g('browser', 'JWT refresh - Stack Overflow'), 'research');
  assert.equal(g('browser', 'Rust tutorial - YouTube'), 'entertainment');
  assert.equal(g('browser', 'r/programming - Reddit'), 'messaging');
  assert.equal(g('chat', '#general - Discord', 'Discord'), 'messaging');
  assert.equal(g('browser', 'Weather in Manila'), 'browsing');
  assert.equal(g('idle', 'Desktop'), 'away');
});

test('ambient sessions report 15-minute buckets on the quarter hour, with drift', () => {
  const start = new Date(2026, 9, 10, 15, 30).getTime();
  const session = buildSession({
    id: 'a',
    goal: 'Ambient',
    mode: 'ambient',
    start,
    durationMin: 45,
    seed: 9,
    phases: [['work', 15], ['drift', 12, 0], ['work', 18]],
  });
  const r = sessionReport(session);
  assert.equal(r.mode, 'ambient');
  assert.equal(r.plannedMin, null);
  assert.deepEqual(
    r.buckets.map((b) => (b.t - start) / MIN),
    [0, 15, 30],
  );
  assert.equal(r.buckets[1].topLabel, 'Video / Entertainment');
  assert.ok(r.buckets[1].driftMs >= 10 * MIN);
  assert.equal(r.buckets[0].driftMs, 0);
});

test('sprint reports carry no ambient buckets', () => {
  const r = sessionReport(
    buildSession({ id: 's', goal: 'G', start: Date.now(), durationMin: 20, seed: 1, phases: [['work', 20]] }),
  );
  assert.equal(r.mode, 'sprint');
  assert.deepEqual(r.buckets, []);
});

test('recorder: an ambient session ends when you stop it, not at a planned length', () => {
  const saved = [];
  const rec = new SessionRecorder({ store: { save: (s) => saved.push(s) } });
  rec.start({ goal: 'Ambient', durationMin: null, startedAt: 1_000_000, mode: 'ambient' });
  const s = rec.finish(1_000_000 + 90 * MIN);
  assert.equal(s.mode, 'ambient');
  assert.equal(s.endedAt, 1_000_000 + 90 * MIN);
});

test('evaluator: Ambient Mode judges against general work and never alerts', async () => {
  const current = { app: 'Google Chrome', label: 'Lofi radio - YouTube', title: 'Lofi radio - YouTube', category: 'browser' };
  const ev = new Evaluator({ daemon: { getState: () => ({ current }) } });
  ev.judge = async () => ({ isDistracted: true, confidence: 0.95, source: 'model' });
  const alerts = [];
  const verdicts = [];
  ev.on('drift', (e) => alerts.push(e));
  ev.on('verdict', (e) => verdicts.push(e));
  ev.reset({ goal: 'Ambient', mode: 'ambient' });
  for (let i = 0; i < 4; i++) await ev.tick();
  assert.equal(verdicts.length, 4);
  assert.equal(alerts.length, 0);

  ev.reset({ goal: 'Finish the auth refactor', mode: 'sprint' });
  for (let i = 0; i < 2; i++) await ev.tick();
  assert.equal(alerts.length, 1);
});
