const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseEditorTitle,
  parseTerminalTitle,
  buildSnapshot,
  resumePrompt,
  templateNote,
  writeNote,
  ResumeTracker,
} = require('../electron/analytics/resume.cjs');
const { buildSession } = require('../electron/analytics/demoDay.cjs');

const MIN = 60_000;
const START = new Date(2026, 9, 10, 10, 0).getTime();

test('editor titles yield file and project', () => {
  assert.deepEqual(parseEditorTitle('auth.service.ts - api - Visual Studio Code'), {
    file: 'auth.service.ts',
    project: 'api',
  });
  assert.deepEqual(parseEditorTitle('\u25cf token.guard.ts - api - Cursor'), { file: 'token.guard.ts', project: 'api' });
  assert.deepEqual(parseEditorTitle('Visual Studio Code'), { file: null, project: null });
});

test('terminal titles yield a command, unless they only name the shell', () => {
  assert.equal(parseTerminalTitle('npm test -- auth'), 'npm test -- auth');
  assert.equal(parseTerminalTitle('Windows PowerShell'), null);
  assert.equal(parseTerminalTitle('C:\\WINDOWS\\system32\\cmd.exe'), null);
  assert.equal(parseTerminalTitle('Administrator: PowerShell'), null);
  assert.equal(parseTerminalTitle('~/code/api'), null);
});

test('snapshot captures file, failing command, references and the interruption', () => {
  const session = buildSession({
    id: 's',
    goal: 'Fix the failing token refresh tests',
    start: START,
    durationMin: 30,
    phases: [['work', 6], ['debug', 6], ['drift', 7, 0], ['work', 1]],
    seed: 4,
  });
  // Taken 10s after coming back from the 7-minute drift (minute 19).
  const snap = buildSnapshot(session, { now: START + 19 * MIN + 10_000 });
  assert.equal(snap.goal, 'Fix the failing token refresh tests');
  assert.ok(snap.file, 'expected an active file');
  assert.equal(snap.command, 'npm test -- auth - 3 failed');
  assert.equal(snap.failing, true);
  assert.equal(snap.interruption.kind, 'drift');
  assert.equal(snap.interruption.site, 'YouTube');
  assert.equal(Math.round(snap.interruption.ms / MIN), 7);

  const prompt = resumePrompt(snap);
  assert.match(prompt, /Goal: Fix the failing token refresh tests/);
  assert.match(prompt, /Last terminal command: npm test -- auth - 3 failed \(failing\)/);
  assert.match(prompt, /Interrupted by: YouTube for 7m/);
});

test('away time is reported as away, not drift', () => {
  const session = buildSession({
    id: 's',
    goal: 'Ship the password reset email',
    start: START,
    durationMin: 20,
    phases: [['work', 8], ['idle', 6], ['work', 1]],
    seed: 5,
  });
  const snap = buildSnapshot(session, { now: START + 15 * MIN });
  assert.equal(snap.interruption.kind, 'away');
  assert.match(resumePrompt(snap), /Away from the keyboard for 6m/);
});

test('template note uses only known facts', () => {
  const note = templateNote({
    goal: 'G',
    file: 'a.ts',
    project: 'api',
    command: 'npm test',
    failing: true,
    references: [],
    interruption: null,
  });
  assert.equal(note.summary, 'You were editing a.ts in api, and last ran `npm test` (it was failing).');
  assert.equal(note.nextStep, 'Re-run `npm test` and fix the first failure.');
});

test('writeNote falls back to the template when the model is unavailable', async () => {
  const snap = { goal: 'G', file: null, project: null, command: null, failing: false, references: [], interruption: null };
  const failing = { generateJson: async () => { throw new Error('offline'); } };
  const note = await writeNote(snap, { ollama: failing, ready: true });
  assert.equal(note.source, 'rules');
  assert.equal(note.summary, 'You were working on "G".');
});

test('tracker fires once when returning after the minimum time away', () => {
  const t = new ResumeTracker({ minAwayMs: 5 * MIN });
  assert.equal(t.update({ at: 0, onTask: true }), null);
  assert.equal(t.update({ at: 1 * MIN, onTask: false }), null);
  assert.equal(t.update({ at: 3 * MIN, onTask: false }), null);
  assert.equal(t.update({ at: 4 * MIN, onTask: true }), null); // only 3 min away
  t.update({ at: 5 * MIN, onTask: false, offSince: 3 * MIN }); // backdated idle
  assert.deepEqual(t.update({ at: 9 * MIN, onTask: true }), { awayMs: 6 * MIN });
  assert.equal(t.update({ at: 10 * MIN, onTask: true }), null);
});
