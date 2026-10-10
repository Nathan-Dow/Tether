// Deterministic synthetic sprints for the tests. Not shipped with the app.
const { classify } = require('../../electron/context/classify.cjs');

const MIN = 60_000;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [process, title]; app/category/label come from the real classifier.
const WORK = [
  ['Code', 'auth.service.ts - api - Visual Studio Code'],
  ['Code', 'token.guard.ts - api - Visual Studio Code'],
  ['Code', 'session.controller.ts - api - Visual Studio Code'],
  ['WindowsTerminal', 'npm run dev'],
  ['WindowsTerminal', 'npm test -- auth'],
  ['chrome', 'JWT refresh token rotation - Stack Overflow - Google Chrome'],
  ['chrome', 'Passport.js documentation - Strategies - Google Chrome'],
  ['chrome', 'OAuth 2.0 Authorization Code Flow - Auth0 Docs - Google Chrome'],
];
const DRIFT = [
  ['chrome', 'Lofi hip hop radio - beats to relax/study to - YouTube - Google Chrome', 'social'],
  ['chrome', 'r/programming - Reddit - Google Chrome', 'social'],
  ['Discord', '#general | Gaming Squad - Discord', 'social'],
  ['chrome', 'Home / X - Google Chrome', 'social'],
  ['chrome', 'Mechanical keyboards | Shopee Philippines - Google Chrome', 'social'],
  ['chrome', 'History of the Byzantine Empire - Wikipedia - Google Chrome', 'informational'],
];
const DEBUG_TERM = ['WindowsTerminal', 'npm test -- auth - 3 failed'];
const DEBUG_SEARCH = ['chrome', 'TypeError: Cannot read properties of undefined - Stack Overflow - Google Chrome'];

const ctx = ([process, title]) => {
  const c = classify({ pid: 1, process, title, description: '' });
  return { ...c, key: `${c.app}|${c.label}` };
};

// phases: [kind, minutes, pickIndex?]
// vision: { pickups: [[startMin, minutes, cause?]] } adds Vision Sentinel data:
// phone spans plus a webcam sample every 7 s.
function buildSession({ id, goal, start, durationMin, phases, seed, mode = 'sprint', vision = null }) {
  const r = rng(seed);
  const between = (a, b) => a + r() * (b - a);
  const segments = [];
  const verdicts = [];
  const alerts = [];
  const judged = new Set();
  let t = start;

  const push = (c, ms, verdict) => {
    const prev = segments.at(-1);
    if (prev && prev.key === c.key && prev.errorSignal === Boolean(c.errorSignal)) prev.end += ms;
    else
      segments.push({
        key: c.key,
        start: t,
        end: t + ms,
        app: c.app,
        label: c.label,
        title: c.title,
        category: c.category,
        errorSignal: Boolean(c.errorSignal),
      });
    if (!judged.has(c.key) && ms >= 8_000) {
      judged.add(c.key);
      verdicts.push({ at: t + 8_000, key: c.key, ...verdict });
    }
    t += ms;
  };

  const workVerdict = (c) =>
    c.category === 'editor' || c.category === 'terminal'
      ? { isDistracted: false, confidence: 0.75, driftType: 'none', source: 'rules', latencyMs: 0, reason: 'Working in a development tool.' }
      : { isDistracted: false, confidence: 0.9, driftType: 'none', source: 'model', latencyMs: Math.round(between(290, 480)), reason: 'Reference material for the goal.' };

  for (const [kind, minutes, pick] of phases) {
    const phaseStart = t;
    const end = t + minutes * MIN;
    if (kind === 'work') {
      while (t < end) {
        const c = ctx(WORK[Math.floor(r() * WORK.length)]);
        push(c, Math.min(end - t, between(0.8, 4) * MIN), workVerdict(c));
      }
    } else if (kind === 'drift') {
      const [p, title, driftType] = DRIFT[pick ?? Math.floor(r() * DRIFT.length)];
      const c = ctx([p, title]);
      const v = {
        isDistracted: true,
        confidence: 0.9,
        driftType,
        source: 'model',
        latencyMs: Math.round(between(300, 500)),
        reason: `${c.label} is unrelated to the goal.`,
      };
      push(c, end - t, v);
      alerts.push({ at: phaseStart + 16_000, key: c.key }); // 2 ticks in
    } else if (kind === 'debug') {
      while (t < end) {
        push(ctx(DEBUG_TERM), Math.min(end - t, between(40, 90) * 1000), workVerdict(ctx(DEBUG_TERM)));
        if (t < end) push(ctx(DEBUG_SEARCH), Math.min(end - t, between(20, 45) * 1000), workVerdict(ctx(DEBUG_SEARCH)));
      }
    } else if (kind === 'thrash') {
      const off = ctx(DRIFT[pick ?? 3]);
      const offVerdict = { isDistracted: true, confidence: 0.9, driftType: 'social', source: 'model', latencyMs: 350, reason: 'Social feed.' };
      const on = ctx(WORK[0]);
      while (t < end) {
        push(on, Math.min(end - t, between(15, 35) * 1000), workVerdict(on));
        if (t < end) push(off, Math.min(end - t, between(10, 25) * 1000), offVerdict);
      }
    } else if (kind === 'idle') {
      push({ app: 'Away', label: 'Away', title: '', category: 'idle', key: 'Away|Away' }, end - t, {});
    }
  }

  let visionData = null;
  if (vision) {
    const phone = vision.pickups.map(([m, len, cause = 'phone']) => ({
      start: start + m * MIN,
      end: start + (m + len) * MIN,
      source: 'camera',
      cause,
    }));
    const samples = [];
    for (let at = start + 1500; at < start + durationMin * MIN; at += 7000) {
      const present = segments.find((s) => s.start <= at && at < s.end)?.category !== 'idle';
      const onPhone = phone.some((p) => p.start <= at && at < p.end);
      const gaze = !present ? 'away' : onPhone ? 'down' : r() < 0.06 ? 'side' : 'screen';
      samples.push({ at, present, gaze });
    }
    visionData = { phone, vision: { enabled: true, samples } };
  }

  return {
    ...visionData,
    version: 1,
    demo: true,
    id,
    goal,
    mode,
    durationMin: mode === 'ambient' ? null : durationMin,
    startedAt: start,
    endedAt: start + durationMin * MIN,
    segments,
    verdicts,
    alerts,
    allowed: [],
  };
}

const at = (day, h, m) => new Date(new Date(day).setHours(h, m, 0, 0)).getTime();

// A full demo day plus a few earlier sessions so the trend arrow has a baseline.
function demoSessions(day = Date.now()) {
  const d = (offset) => new Date(new Date(day).setHours(12, 0, 0, 0) - offset * 24 * 60 * MIN);
  const sessions = [];

  // Earlier days: noticeably more drift, so today trends upward.
  [3, 2, 1].forEach((offset, i) => {
    sessions.push(
      buildSession({
        id: `demo-prev-${i}`,
        goal: 'Wire up the login API',
        start: at(d(offset), 10, 0),
        durationMin: 45,
        seed: 100 + i,
        phases: [['work', 10], ['drift', 7, 0], ['thrash', 6], ['work', 8], ['drift', 6, 2], ['work', 8]],
      }),
    );
  });

  sessions.push(
    buildSession({
      id: 'demo-1',
      goal: 'Finish the auth refactor',
      start: at(day, 9, 5),
      durationMin: 50,
      seed: 1,
      phases: [['work', 18], ['drift', 6, 0], ['work', 12], ['thrash', 4], ['work', 10]],
    }),
    buildSession({
      id: 'demo-2',
      goal: 'Fix the failing token refresh tests',
      start: at(day, 10, 30),
      durationMin: 40,
      seed: 2,
      phases: [['work', 8], ['debug', 11], ['work', 9], ['drift', 4, 5], ['work', 8]],
    }),
    buildSession({
      id: 'demo-3',
      goal: 'Ship the password reset email',
      start: at(day, 14, 0),
      durationMin: 45,
      seed: 3,
      phases: [['work', 22], ['idle', 4], ['work', 8], ['drift', 3, 2], ['work', 8]],
      // Run with the Vision Sentinel on: two pickups and a head-down spell.
      vision: { pickups: [[9, 2], [29, 1, 'head-down'], [41, 1.5]] },
    }),
    // An afternoon in Ambient Mode: no goal or timer, just quiet logging.
    buildSession({
      id: 'demo-ambient',
      goal: 'Ambient',
      mode: 'ambient',
      start: at(day, 15, 30),
      durationMin: 75,
      seed: 4,
      phases: [['work', 20], ['drift', 9, 2], ['work', 14], ['thrash', 5], ['drift', 6, 1], ['work', 21]],
    }),
  );
  return sessions;
}

module.exports = { demoSessions, buildSession };
