const test = require('node:test');
const assert = require('node:assert/strict');

const { parseDuration, cleanGoal, extractIntent } = require('../electron/voice/intent.cjs');
const { encodeWav, cleanTranscript, audioCtxFor } = require('../electron/voice/stt.cjs');

test('durations are read from digits, words and common phrases', () => {
  const cases = [
    ["Let's spend 30 minutes refactoring the Drizzle schema", 30],
    ['Give me an hour and a half to write the README', 90],
    ['fix the login bug for twenty five minutes', 25],
    ['two hours on the dashboard charts', 120],
    ['half an hour of code review', 30],
    ['1 hour 15 minutes migrating to Postgres', 75],
    ['45m polish the onboarding flow', 45],
    ['one and a half hours for the API docs', 90],
    ['a quarter of an hour on emails', 15],
    ['write the README', null],
  ];
  for (const [text, minutes] of cases) assert.equal(parseDuration(text).minutes, minutes, text);
});

test('"I am" and "a minute bug" are not durations', () => {
  assert.equal(parseDuration('I am going to fix the timer').minutes, null);
  assert.equal(parseDuration('fix a minute rounding bug').minutes, null);
});

test('the spoken scaffolding is stripped from the goal', () => {
  const goal = (t) => cleanGoal(parseDuration(t).rest);
  assert.equal(goal("Let's spend 30 minutes refactoring the Drizzle schema."), 'Refactoring the Drizzle schema');
  assert.equal(goal('I am going to fix the login bug for twenty five minutes'), 'Fix the login bug');
  assert.equal(goal('okay so I need to write the README'), 'Write the README');
  assert.equal(goal('half an hour of code review'), 'Code review');
  assert.equal(goal('Start a 30 minute session on Claude Code.'), 'Claude Code');
  assert.equal(goal('Begin a sprint on the API docs'), 'The API docs');
  assert.equal(goal('Start the deploy script'), 'Start the deploy script');
});

test('without the model, the transcript becomes the goal and 25 min is the default', async () => {
  const down = { generateJson: async () => { throw new Error('offline'); } };
  const r = await extractIntent('okay so I need to write the README', { ollama: down, ready: true });
  assert.deepEqual(
    { goal: r.goal, durationMin: r.durationMin, durationSaid: r.durationSaid, source: r.source },
    { goal: 'Write the README', durationMin: 25, durationSaid: false, source: 'rules' },
  );
});

test("the model's goal is used, but parsed minutes beat the model's arithmetic", async () => {
  const fake = {
    generateJson: async () => ({
      data: { goal: 'Refactor Drizzle schema & fix migration', durationMinutes: 45, domain: 'Database' },
      latencyMs: 200,
    }),
  };
  const r = await extractIntent("Let's spend 30 minutes refactoring the Drizzle schema and fixing the migration.", {
    ollama: fake,
    ready: true,
  });
  assert.equal(r.goal, 'Refactor Drizzle schema & fix migration');
  assert.equal(r.durationMin, 30);
  assert.equal(r.domain, 'Database');
  assert.equal(r.source, 'model');
});

test('model durations under 5 minutes and over 240 are not trusted as-is', async () => {
  const fake = (min) => ({ generateJson: async () => ({ data: { goal: 'G', durationMinutes: min, domain: 'Other' }, latencyMs: 1 }) });
  assert.equal((await extractIntent('fix it', { ollama: fake(1), ready: true })).durationMin, 25);
  assert.equal((await extractIntent('fix it', { ollama: fake(600), ready: true })).durationMin, 240);
  assert.equal((await extractIntent('fix it', { ollama: fake(1), ready: true })).domain, null);
});

test('WAV encoding: 16 kHz mono 16-bit header and clipped samples', () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16_000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.length, 44 + 8);
  assert.equal(wav.readInt16LE(46), 32767);
  assert.equal(wav.readInt16LE(48), -32768);
  assert.equal(wav.readInt16LE(50), 32767);
});

test('transcript tags are removed and audio context scales with clip length', () => {
  assert.equal(cleanTranscript(' [BLANK_AUDIO]\n Fix the tests. (keyboard clicking) '), 'Fix the tests.');
  assert.equal(audioCtxFor(1), 256);
  assert.equal(audioCtxFor(5), 314);
  assert.equal(audioCtxFor(60), 1500);
});
