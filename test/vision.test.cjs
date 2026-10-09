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
  rec.onPhone({ phoneDetected: true, source: 'demo' }, t0 + 20 * MIN); // never put down

  const session = rec.finish(t0 + 25 * MIN);
  assert.deepEqual(session.phone, [
    { start: t0 + 5 * MIN, end: t0 + 7 * MIN, source: 'camera' },
    { start: t0 + 20 * MIN, end: t0 + 25 * MIN, source: 'demo' },
  ]);

  const physical = sessionReport(session).episodes.filter((e) => e.kind === 'physical');
  assert.equal(physical.length, 2);
  assert.equal(physical[0].durationMs, 2 * MIN);
  assert.deepEqual(physical[1].sites, ['Smartphone (demo)']);
});

test('phone events outside a sprint are ignored', () => {
  const rec = new SessionRecorder({ store: { save() {} } });
  rec.onPhone({ phoneDetected: true }); // no session: must not throw
  assert.equal(rec.session, null);
});
