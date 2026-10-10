const test = require('node:test');
const assert = require('node:assert/strict');

const { sessionReport } = require('../electron/analytics/metrics.cjs');
const { SessionRecorder } = require('../electron/analytics/recorder.cjs');

const MIN = 60_000;

test('phone pickups land in the friction ledger as physical drift', () => {
  const saved = [];
  const rec = new SessionRecorder({ store: { save: (s) => saved.push(s) } });
  const t0 = Date.UTC(2026, 9, 10, 1, 0);
  rec.start({ goal: 'Ship auth', durationMin: 25, startedAt: t0 });
  rec.onContext({ app: 'Code', label: 'auth.ts', title: 'auth.ts', category: 'editor' }, t0);

  rec.onPhone({ phoneDetected: true, source: 'camera' }, t0 + 5 * MIN);
  rec.onPhone({ phoneDetected: true, source: 'camera' }, t0 + 6 * MIN); // still holding: no new pickup
  rec.onPhone({ phoneDetected: false }, t0 + 7 * MIN);
  rec.onPhone({ phoneDetected: true, source: 'camera', cause: 'head-down' }, t0 + 12 * MIN);
  rec.onPhone({ phoneDetected: false }, t0 + 13 * MIN);
  rec.onPhone({ phoneDetected: true, source: 'demo' }, t0 + 20 * MIN); // never put down

  const session = rec.finish(t0 + 25 * MIN);
  assert.deepEqual(session.phone, [
    { start: t0 + 5 * MIN, end: t0 + 7 * MIN, source: 'camera', cause: 'phone' },
    { start: t0 + 12 * MIN, end: t0 + 13 * MIN, source: 'camera', cause: 'head-down' },
    { start: t0 + 20 * MIN, end: t0 + 25 * MIN, source: 'demo', cause: 'phone' },
  ]);

  const physical = sessionReport(session).episodes.filter((e) => e.kind === 'physical');
  assert.equal(physical.length, 3);
  assert.equal(physical[0].durationMs, 2 * MIN);
  assert.deepEqual(physical[1].sites, ['Head down (phone in lap?)']);
  assert.deepEqual(physical[2].sites, ['Smartphone (demo)']);
});

test('phone time is drift everywhere: totals, deep work, leaderboard, ribbon', () => {
  const rec = new SessionRecorder({ store: { save() {} } });
  const t0 = Date.UTC(2026, 9, 10, 2, 0);
  rec.start({ goal: 'Ship auth', durationMin: 25, startedAt: t0 });
  rec.onContext({ app: 'Code', label: 'auth.ts', title: 'auth.ts', category: 'editor' }, t0);
  rec.onPhone({ phoneDetected: true, source: 'camera' }, t0 + 5 * MIN);
  rec.onPhone({ phoneDetected: false }, t0 + 7 * MIN);
  rec.onPhone({ phoneDetected: true, source: 'camera', cause: 'head-down' }, t0 + 12 * MIN);
  rec.onPhone({ phoneDetected: false }, t0 + 13 * MIN);
  const r = sessionReport(rec.finish(t0 + 25 * MIN));

  assert.equal(r.totals.driftMs, 3 * MIN);
  assert.equal(r.totals.onTaskMs, 22 * MIN);
  // 0-5, 7-12 and 13-25 are each >= 5 min of unbroken editor time.
  assert.equal(r.deepWorkMs, 22 * MIN);
  assert.equal(r.leaderboard[0].site, 'Smartphone');
  assert.equal(r.timeline[5].state, 'drift');
  assert.equal(r.timeline[3].state, 'focus');
  assert.ok(r.flowScore < 100);
  assert.equal(r.vision, null); // pickups alone don't mean the camera report was on
});

test('vision report: presence, gaze and pickups from webcam samples', () => {
  const rec = new SessionRecorder({ store: { save() {} } });
  const t0 = Date.UTC(2026, 9, 10, 3, 0);
  rec.start({ goal: 'Ship auth', durationMin: 25, startedAt: t0 });
  rec.onContext({ app: 'Code', label: 'auth.ts', title: 'auth.ts', category: 'editor' }, t0);
  rec.onVisionSample({ status: 'on' });
  const gazes = ['screen', 'screen', 'screen', 'down', 'side', 'screen', 'away', 'screen'];
  gazes.forEach((gaze, i) => rec.onVisionSample({ at: t0 + i * 7000, present: gaze !== 'away', gaze }));
  rec.onPhone({ phoneDetected: true }, t0 + 2 * MIN);
  rec.onPhone({ phoneDetected: false }, t0 + 3 * MIN);
  const v = sessionReport(rec.finish(t0 + 25 * MIN)).vision;

  assert.equal(v.samples, 8);
  assert.equal(v.presentShare, 7 / 8);
  assert.equal(v.onScreenShare, 5 / 7);
  assert.equal(v.pickups, 1);
  assert.equal(v.phoneMs, MIN);
  assert.equal(v.headDowns, 0);
});

test('vision on with no camera reports it, without breaking the session', () => {
  const rec = new SessionRecorder({ store: { save() {} } });
  const t0 = Date.UTC(2026, 9, 10, 4, 0);
  rec.start({ goal: 'Ship auth', durationMin: 25, startedAt: t0 });
  rec.onContext({ app: 'Code', label: 'auth.ts', title: 'auth.ts', category: 'editor' }, t0);
  rec.onVisionSample({ status: 'on' });
  rec.onVisionSample({ status: 'unavailable' });
  const r = sessionReport(rec.finish(t0 + 25 * MIN));
  assert.equal(r.vision.cameraOk, false);
  assert.equal(r.totals.onTaskMs, 25 * MIN);
});

test('phone events outside a sprint are ignored', () => {
  const rec = new SessionRecorder({ store: { save() {} } });
  rec.onPhone({ phoneDetected: true }); // no session: must not throw
  assert.equal(rec.session, null);
});
