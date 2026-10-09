const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LabelStore } = require('../electron/analytics/labels.cjs');
const { sessionReport, dayReport } = require('../electron/analytics/metrics.cjs');
const { buildSession } = require('../electron/analytics/demoDay.cjs');
const { Evaluator } = require('../electron/ai/evaluator.cjs');

const MIN = 60_000;
const START = new Date(2026, 9, 10, 9, 0, 0).getTime();
const withYouTube = () =>
  buildSession({
    id: 't',
    goal: 'Finish the auth refactor',
    start: START,
    durationMin: 20,
    phases: [['work', 8], ['drift', 7, 0], ['work', 5]],
    seed: 3,
  });

test('label store persists, ignores unknown labels, and can hand a site back', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tether-labels-')), 'labels.json');
  const a = new LabelStore(file);
  a.set('YouTube', 'focus');
  a.set('Discord', 'drift');
  a.set('Reddit', 'banana');
  assert.deepEqual(new LabelStore(file).all(), { YouTube: 'focus', Discord: 'drift' });
  a.set('YouTube', null);
  assert.deepEqual(new LabelStore(file).all(), { Discord: 'drift' });
});

test('an "always on-task" label re-scores past drift', () => {
  const before = sessionReport(withYouTube());
  assert.ok(before.totals.driftMs >= 6 * MIN);
  assert.equal(before.leaderboard[0].site, 'YouTube');

  const after = sessionReport(withYouTube(), { labels: { YouTube: 'focus' } });
  assert.equal(after.totals.driftMs, 0);
  assert.equal(after.leaderboard.length, 0);
  assert.ok(after.flowScore > before.flowScore);
  const row = after.stream.find((r) => r.site === 'YouTube');
  assert.equal(row.state, 'focus');
  assert.equal(row.verdict.source, 'you');
});

test('an "always drift" label turns on-task time into drift, and dayReport passes labels through', () => {
  const day = dayReport([withYouTube()], { day: START, labels: { 'Stack Overflow': 'drift' } });
  const so = day.sessions[0].stream.filter((r) => r.site === 'Stack Overflow');
  assert.ok(so.length > 0, 'expected Stack Overflow in the work phases');
  assert.ok(so.every((r) => r.state === 'drift'));
  assert.ok(day.leaderboard.some((l) => l.site === 'Stack Overflow'));
});

test('the live evaluator obeys labels before rules or the model', async () => {
  const ev = new Evaluator({ daemon: null, getLabels: () => ({ 'Visual Studio Code': 'drift', YouTube: 'focus' }) });
  ev.reset({ goal: 'Finish the auth refactor' });

  const code = { app: 'Visual Studio Code', label: 'auth.ts - api', title: 'auth.ts - api - Visual Studio Code', category: 'editor' };
  const yt = { app: 'Google Chrome', label: 'Rust tutorial - YouTube', title: 'Rust tutorial - YouTube', category: 'browser' };
  const v1 = await ev.judge(code, {});
  assert.equal(v1.source, 'you');
  assert.equal(v1.isDistracted, true);
  const v2 = await ev.judge(yt, {});
  assert.equal(v2.source, 'you');
  assert.equal(v2.isDistracted, false);
});
