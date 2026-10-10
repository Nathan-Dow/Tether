// Focus analytics. Pure functions over recorded sessions - no Electron, no
// clock reads - so they're unit-testable and reusable for demo data.
//
// Segment states:
//   focus  on-task (verdict aligned)
//   debug  on-task, but the terminal/editor title shows errors
//   drift  off-task (confident distracted verdict)
//   idle   desktop / away from the keyboard
//
// With the Vision Sentinel on, phone time (a phone in frame, or head down
// for a while) overrides whatever window was in front: it's drift.
const { heuristicVerdict } = require('../ai/heuristics.cjs');
const { labelVerdict } = require('./labels.cjs');
const { GROUPS, groupOf } = require('./groups.cjs');

const MIN = 60_000;
const HOUR = 60 * MIN;

const CFG = {
  windowMs: 15 * MIN, // CFI window
  rapidMs: 90_000, // on-task <-> off-task flips this close together are "thrash"
  driftConfidence: 0.6, // below this a distracted verdict counts as on-task
  driftMergeGapMs: 60_000, // a quick peek back at work doesn't end a rabbit hole
  minEpisodeMs: 30_000, // shorter drift episodes are noise, not friction debt
  ribbonDriftMs: 15_000, // a minute with this much drift is marked amber
  ribbonDebugMs: 30_000, // ...and this much debugging, cyan
  debugMergeGapMs: 60_000, // terminal <-> Stack Overflow bouncing is one loop
  debugLoopMinMs: 5 * MIN, // error-titled work this long = Debugger Loop
  deepMinMs: 5 * MIN, // on-task stretch this long counts as deep work
  deepBreakDriftMs: 30_000, // drift longer than this breaks a deep stretch
  deepRepeatPeekMs: 2 * MIN, // ...as does a second peek this soon after the last
  deepBreakIdleMs: 2 * MIN,
  penalty: { same: 1, domain: 8, rapid: 12 },
};

const ON_TASK = new Set(['focus', 'debug']);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// "Lofi hip hop radio - YouTube" -> "YouTube"; apps stay as the app name.
function siteOf(seg) {
  if (seg.category !== 'browser') return seg.app;
  const label = seg.label || '';
  if (/\s\/\sX$/.test(label)) return 'X';
  const parts = label.split(/\s[-|\u2013\u2014·]\s/).map((p) => p.trim()).filter(Boolean);
  const last = parts.at(-1);
  return parts.length > 1 && last.length <= 30 ? last : label.slice(0, 40) || seg.app;
}

// Pick the verdict that applied to this segment: the latest one for its key
// at or before the segment ended, else the first one after (judged late).
function verdictFor(seg, byKey, goal) {
  const list = byKey.get(seg.key);
  if (list?.length) {
    let pick = null;
    for (const v of list) {
      if (v.at <= seg.end) pick = v;
      else break;
    }
    return pick ?? list[0];
  }
  const h = heuristicVerdict({ goal, current: seg });
  return { ...h, source: 'rules' };
}

// Clip segments to the sprint and attach state, verdict and site. Your own
// labels ({ site: 'focus' | 'drift' }) override whatever was judged at the time.
function annotate(session, { labels = {} } = {}) {
  const start = session.startedAt;
  const end = session.endedAt ?? session.segments.at(-1)?.end ?? start;
  const byKey = new Map();
  for (const v of [...(session.verdicts || [])].sort((a, b) => a.at - b.at)) {
    if (!byKey.has(v.key)) byKey.set(v.key, []);
    byKey.get(v.key).push(v);
  }

  const out = [];
  for (const raw of session.segments || []) {
    const s = Math.max(raw.start, start);
    const e = Math.min(raw.end, end);
    if (e <= s) continue;
    const seg = { ...raw, start: s, end: e, ms: e - s };
    const site = siteOf(seg);
    let state;
    let verdict = null;
    if (seg.category === 'idle') {
      state = 'idle';
    } else {
      verdict = verdictFor(seg, byKey, session.goal);
      if (Object.hasOwn(labels, site)) {
        const judged = verdict.driftType && verdict.driftType !== 'none' ? verdict.driftType : undefined;
        verdict = labelVerdict(site, labels[site], judged);
      }
      if (verdict.isDistracted && verdict.confidence >= CFG.driftConfidence) state = 'drift';
      else state = seg.errorSignal ? 'debug' : 'focus';
    }
    out.push({ ...seg, state, verdict, site });
  }
  return { start, end, segments: overlayPhone(out, session.phone, end) };
}

const PHONE_SITE = { phone: 'Smartphone', 'head-down': 'Head down (phone in lap?)' };

function phoneSegment(seg, a, b, p) {
  const site = p.source === 'demo' ? 'Smartphone (demo)' : (PHONE_SITE[p.cause] ?? 'Smartphone');
  return {
    ...seg,
    key: `Phone|${site}`,
    start: a,
    end: b,
    ms: b - a,
    app: 'Smartphone',
    label: site,
    title: site,
    category: 'phone',
    errorSignal: false,
    site,
    state: 'drift',
    verdict: {
      isDistracted: true,
      confidence: 0.9,
      driftType: 'physical',
      source: 'vision',
      reason: p.cause === 'head-down' ? 'Head down for ~14 s (Vision Sentinel)' : 'Phone in frame (Vision Sentinel)',
    },
  };
}

// Cut each phone span out of the windows it overlaps and mark it as drift,
// so it counts against focus time, deep work, the ribbon and the flow score.
function overlayPhone(segments, phone, end) {
  const spans = (phone || [])
    .map((p) => ({ ...p, end: Math.min(p.end ?? end, end) }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start);
  if (!spans.length) return segments;
  const out = [];
  for (const seg of segments) {
    let cur = seg.start;
    for (const p of spans) {
      if (p.end <= cur || p.start >= seg.end) continue;
      const a = Math.max(p.start, cur);
      const b = Math.min(p.end, seg.end);
      if (a > cur) out.push({ ...seg, start: cur, end: a, ms: a - cur });
      out.push(phoneSegment(seg, a, b, p));
      cur = b;
    }
    if (cur === seg.start) out.push(seg);
    else if (cur < seg.end) out.push({ ...seg, start: cur, end: seg.end, ms: seg.end - cur });
  }
  return out;
}

function totalsOf(segments) {
  const t = { focusMs: 0, debugMs: 0, driftMs: 0, idleMs: 0 };
  for (const s of segments) t[`${s.state}Ms`] += s.ms;
  t.activeMs = t.focusMs + t.debugMs + t.driftMs;
  t.onTaskMs = t.focusMs + t.debugMs;
  return t;
}

// Switches between apps/pages (idle hops excluded).
function switchesOf(segments) {
  const out = [];
  let prev = null;
  for (const s of segments) {
    if (s.state === 'idle') continue;
    if (prev && prev.key !== s.key) {
      out.push({
        at: s.start,
        from: prev.site,
        to: s.site,
        domainChange: ON_TASK.has(prev.state) !== ON_TASK.has(s.state),
      });
    }
    prev = s;
  }
  // Rapid = a domain change within rapidMs of the previous domain change.
  let lastDomainAt = -Infinity;
  for (const sw of out) {
    sw.rapid = false;
    if (!sw.domainChange) continue;
    sw.rapid = sw.at - lastDomainAt <= CFG.rapidMs;
    lastDomainAt = sw.at;
  }
  return out;
}

function overlapMs(seg, a, b) {
  return Math.max(0, Math.min(seg.end, b) - Math.max(seg.start, a));
}

// Context Fragmentation Index per 15-minute window: 100 = unbroken flow,
// 0 = thrashing. Penalty is normalised to a full window of activity.
function cfiWindows(segments, switches, start, end) {
  const windows = [];
  for (let a = start; a < end; a += CFG.windowMs) {
    const b = Math.min(a + CFG.windowMs, end);
    const activeMs = sum(
      segments.filter((s) => s.state !== 'idle').map((s) => overlapMs(s, a, b)),
    );
    const inWin = switches.filter((sw) => sw.at >= a && sw.at < b);
    const same = inWin.filter((sw) => !sw.domainChange).length;
    const domain = inWin.filter((sw) => sw.domainChange).length;
    const rapid = inWin.filter((sw) => sw.rapid).length;
    let cfi = null;
    if (activeMs >= MIN) {
      const raw = CFG.penalty.same * same + CFG.penalty.domain * domain + CFG.penalty.rapid * rapid;
      const scale = CFG.windowMs / Math.max(activeMs, 5 * MIN);
      cfi = Math.round(clamp(100 - raw * scale, 0, 100));
    }
    windows.push({
      start: a,
      end: b,
      activeMs,
      switches: inWin.length,
      domainSwitches: domain,
      rapidSwitches: rapid,
      cfi,
      thrash: rapid > 0,
      examples: inWin.filter((sw) => sw.rapid).slice(0, 3).map((sw) => `${sw.from} → ${sw.to}`),
    });
  }
  return windows;
}

function weightedCfi(windows) {
  const scored = windows.filter((w) => w.cfi !== null);
  const weight = sum(scored.map((w) => w.activeMs));
  if (!weight) return null;
  return Math.round(sum(scored.map((w) => w.cfi * w.activeMs)) / weight);
}

// Merge runs of `state` segments separated by gaps shorter than gapMs.
function runsOf(segments, state, gapMs) {
  const runs = [];
  let cur = null;
  for (const s of segments) {
    if (s.state !== state) continue;
    if (cur && s.start - cur.end <= gapMs) {
      cur.end = s.end;
      cur.parts.push(s);
    } else {
      cur = { start: s.start, end: s.end, parts: [s] };
      runs.push(cur);
    }
  }
  return runs;
}

function dominant(counts) {
  let best = null;
  for (const [k, v] of Object.entries(counts)) if (!best || v > counts[best]) best = k;
  return best;
}

// Friction Debt: rabbit holes (drift runs) and Debugger Loops (long
// error-titled work runs), with how long each lasted before returning.
function episodesOf(segments) {
  const episodes = [];

  for (const run of runsOf(segments, 'drift', CFG.driftMergeGapMs)) {
    const typeMs = {};
    const siteMs = {};
    for (const p of run.parts) {
      const t = p.verdict?.driftType && p.verdict.driftType !== 'none' ? p.verdict.driftType : 'social';
      typeMs[t] = (typeMs[t] || 0) + p.ms;
      siteMs[p.site] = (siteMs[p.site] || 0) + p.ms;
    }
    const durationMs = sum(run.parts.map((p) => p.ms));
    const kind = dominant(typeMs);
    // Every phone pickup is listed; short window peeks are noise.
    if (durationMs < CFG.minEpisodeMs && kind !== 'physical') continue;
    const after = segments.find((s) => s.start >= run.end && s.state !== 'drift');
    episodes.push({
      kind: ['informational', 'debugging', 'physical'].includes(kind) ? kind : 'social',
      start: run.start,
      end: run.end,
      durationMs,
      sites: Object.keys(siteMs).sort((a, b) => siteMs[b] - siteMs[a]),
      returnedToGoal: Boolean(after && ON_TASK.has(after.state)),
    });
  }

  for (const run of runsOf(segments, 'debug', CFG.debugMergeGapMs)) {
    const durationMs = run.end - run.start; // includes the Stack Overflow hops
    if (durationMs < CFG.debugLoopMinMs) continue;
    episodes.push({
      kind: 'debugging',
      start: run.start,
      end: run.end,
      durationMs,
      sites: [...new Set(run.parts.map((p) => p.site))],
      returnedToGoal: true,
    });
  }

  return episodes.sort((a, b) => a.start - b.start);
}

// Vision Sentinel summary for a session (null when it was off): how much of
// the time you were at the desk, facing the screen, and on your phone.
function visionOf(session, end) {
  const v = session.vision;
  if (!v?.enabled) return null;
  const samples = v.samples || [];
  const present = samples.filter((s) => s.present);
  const gazeShare = (g) => (present.length ? present.filter((s) => s.gaze === g).length / present.length : null);
  const spans = (session.phone || []).map((p) => ({ ...p, ms: Math.max(0, Math.min(p.end ?? end, end) - p.start) }));
  const phone = spans.filter((p) => p.cause !== 'head-down');
  const down = spans.filter((p) => p.cause === 'head-down');
  return {
    samples: samples.length,
    presentSamples: present.length,
    cameraOk: samples.length > 0,
    presentShare: samples.length ? present.length / samples.length : null,
    onScreenShare: gazeShare('screen'),
    downShare: gazeShare('down'),
    sideShare: gazeShare('side'),
    pickups: phone.length,
    phoneMs: sum(phone.map((p) => p.ms)),
    headDowns: down.length,
    headDownMs: sum(down.map((p) => p.ms)),
    longestMs: Math.max(0, ...spans.map((p) => p.ms)),
  };
}

// Day roll-up of visionOf(); shares are weighted by webcam samples.
function visionDayOf(list) {
  const on = list.filter(Boolean);
  if (!on.length) return null;
  const n = sum(on.map((v) => v.samples));
  const np = sum(on.map((v) => v.presentSamples));
  const w = (k, weight) => {
    const total = sum(on.map(weight));
    return total ? sum(on.map((v) => (v[k] ?? 0) * weight(v))) / total : null;
  };
  return {
    sessions: on.length,
    samples: n,
    presentSamples: np,
    cameraOk: n > 0,
    presentShare: w('presentShare', (v) => v.samples),
    onScreenShare: w('onScreenShare', (v) => v.presentSamples),
    downShare: w('downShare', (v) => v.presentSamples),
    sideShare: w('sideShare', (v) => v.presentSamples),
    pickups: sum(on.map((v) => v.pickups)),
    phoneMs: sum(on.map((v) => v.phoneMs)),
    headDowns: sum(on.map((v) => v.headDowns)),
    headDownMs: sum(on.map((v) => v.headDownMs)),
    longestMs: Math.max(0, ...on.map((v) => v.longestMs)),
  };
}

// Verified Deep Work: on-task stretches of >= deepMinMs. A single short peek
// at a distraction (< deepBreakDriftMs) doesn't break the stretch (nor count);
// a longer drift, or another peek within deepRepeatPeekMs, does.
function deepWorkOf(segments) {
  let total = 0;
  let stretchMs = 0;
  let lastDriftEnd = -Infinity;
  const flush = () => {
    if (stretchMs >= CFG.deepMinMs) total += stretchMs;
    stretchMs = 0;
  };
  for (const s of segments) {
    if (ON_TASK.has(s.state)) {
      stretchMs += s.ms;
    } else if (s.state === 'drift') {
      if (s.ms >= CFG.deepBreakDriftMs || s.start - lastDriftEnd < CFG.deepRepeatPeekMs) flush();
      lastDriftEnd = s.end;
    } else if (s.state === 'idle' && s.ms >= CFG.deepBreakIdleMs) {
      flush();
    }
  }
  flush();
  return total;
}

// Minute-by-minute ribbon. Drift and debugging are flagged even when they
// only fill part of a minute; otherwise the larger of focus/idle wins.
function timelineOf(segments, start, end) {
  const n = Math.max(1, Math.ceil((end - start) / MIN));
  const buckets = Array.from({ length: n }, (_, i) => ({
    t: start + i * MIN,
    focusMs: 0,
    debugMs: 0,
    driftMs: 0,
    idleMs: 0,
    top: null,
  }));
  const topMs = buckets.map(() => ({}));
  for (const s of segments) {
    for (let i = Math.floor((s.start - start) / MIN); i < n && start + i * MIN < s.end; i++) {
      if (i < 0) continue;
      const ms = overlapMs(s, start + i * MIN, start + (i + 1) * MIN);
      if (!ms) continue;
      buckets[i][`${s.state}Ms`] += ms;
      topMs[i][s.site] = (topMs[i][s.site] || 0) + ms;
    }
  }
  return buckets.map((b, i) => {
    const covered = b.focusMs + b.debugMs + b.driftMs + b.idleMs;
    let state = 'none';
    if (b.driftMs >= CFG.ribbonDriftMs) state = 'drift';
    else if (b.debugMs >= CFG.ribbonDebugMs) state = 'debug';
    else if (covered >= 5_000) state = b.idleMs > b.focusMs + b.debugMs + b.driftMs ? 'idle' : 'focus';
    return { ...b, state, top: dominant(topMs[i]) };
  });
}

function leaderboardOf(segments, limit = 8) {
  const ms = {};
  for (const s of segments) if (s.state === 'drift') ms[s.site] = (ms[s.site] || 0) + s.ms;
  const total = sum(Object.values(ms));
  return Object.entries(ms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([site, v]) => ({ site, ms: v, share: total ? v / total : 0 }));
}

// Ambient Mode: rolling 15-minute buckets (on the clock's quarter hours) of
// what kind of activity filled them, plus how much of it was drift.
const BUCKET_MS = 15 * MIN;
function ambientBucketsOf(segments, start, end) {
  const out = [];
  for (let a = Math.floor(start / BUCKET_MS) * BUCKET_MS; a < end; a += BUCKET_MS) {
    const b = a + BUCKET_MS;
    const ms = {};
    let driftMs = 0;
    for (const seg of segments) {
      const o = overlapMs(seg, a, b);
      if (!o) continue;
      const g = groupOf(seg);
      ms[g] = (ms[g] || 0) + o;
      if (seg.state === 'drift') driftMs += o;
    }
    const groups = Object.entries(ms)
      .sort((x, y) => y[1] - x[1])
      .map(([key, v]) => ({ key, label: GROUPS[key], ms: v }));
    if (!groups.length) continue;
    const active = groups.filter((g) => g.key !== 'away');
    out.push({
      t: a,
      end: b,
      groups,
      top: (active[0] ?? groups[0]).key,
      topLabel: (active[0] ?? groups[0]).label,
      activeMs: sum(active.map((g) => g.ms)),
      driftMs,
    });
  }
  return out;
}

function velocityStatus(perHour) {
  if (perHour == null) return null;
  if (perHour >= 40) return 'thrashing';
  if (perHour >= 20) return 'scattered';
  return 'steady';
}

function flowScoreOf(totals, cfi) {
  if (!totals.activeMs || cfi == null) return null;
  const share = (totals.onTaskMs / totals.activeMs) * 100;
  return Math.round((share + cfi) / 2);
}

function sessionReport(session, { labels } = {}) {
  const { start, end, segments } = annotate(session, { labels });
  const totals = totalsOf(segments);
  const switches = switchesOf(segments);
  const windows = cfiWindows(segments, switches, start, end);
  const cfi = weightedCfi(windows);
  const episodes = episodesOf(segments);
  const perHour = totals.activeMs ? switches.length / (totals.activeMs / HOUR) : null;

  return {
    id: session.id,
    goal: session.goal,
    mode: session.mode === 'ambient' ? 'ambient' : 'sprint',
    demo: Boolean(session.demo),
    startedAt: start,
    endedAt: end,
    plannedMin: session.durationMin,
    totals,
    flowScore: flowScoreOf(totals, cfi),
    cfi,
    cfiWindows: windows,
    switches: switches.length,
    switchesPerHour: perHour == null ? null : Math.round(perHour),
    velocity: velocityStatus(perHour),
    deepWorkMs: deepWorkOf(segments),
    frictionDebtMs: sum(episodes.map((e) => e.durationMs)),
    episodes,
    leaderboard: leaderboardOf(segments),
    timeline: timelineOf(segments, start, end),
    buckets: session.mode === 'ambient' ? ambientBucketsOf(segments, start, end) : [],
    alerts: (session.alerts || []).length,
    modelVerdicts: (session.verdicts || []).filter((v) => v.source === 'model').length,
    vision: visionOf(session, end),
    stream: segments.map((s) => ({
      start: s.start,
      end: s.end,
      app: s.app,
      label: s.label,
      title: s.title,
      site: s.site,
      category: s.category,
      group: GROUPS[groupOf(s)],
      state: s.state,
      verdict: s.verdict && {
        source: s.verdict.source,
        confidence: s.verdict.confidence,
        driftType: s.verdict.driftType,
        reason: s.verdict.reason,
      },
    })),
  };
}

const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Dashboard model for one day, with the trend against earlier sessions.
function dayReport(sessions, { day = Date.now(), labels } = {}) {
  const today = sessions.filter((s) => dayKey(s.startedAt) === dayKey(day));
  const earlier = sessions.filter((s) => s.startedAt < new Date(day).setHours(0, 0, 0, 0));
  const reports = today.map((s) => sessionReport(s, { labels }));

  const totals = { focusMs: 0, debugMs: 0, driftMs: 0, idleMs: 0, activeMs: 0, onTaskMs: 0 };
  for (const r of reports) for (const k of Object.keys(totals)) totals[k] += r.totals[k];

  const switches = sum(reports.map((r) => r.switches));
  const scored = reports.filter((r) => r.flowScore != null);
  const weight = sum(scored.map((r) => r.totals.activeMs));
  const flowScore = weight
    ? Math.round(sum(scored.map((r) => r.flowScore * r.totals.activeMs)) / weight)
    : null;

  const prevScores = earlier
    .slice(-10)
    .map((s) => sessionReport(s, { labels }))
    .map((r) => r.flowScore)
    .filter((v) => v != null);
  const prevAvg = prevScores.length ? Math.round(sum(prevScores) / prevScores.length) : null;

  const perHour = totals.activeMs ? switches / (totals.activeMs / HOUR) : null;

  const leaderboardMs = {};
  for (const r of reports) for (const l of r.leaderboard) leaderboardMs[l.site] = (leaderboardMs[l.site] || 0) + l.ms;
  const lbTotal = sum(Object.values(leaderboardMs));

  return {
    day: dayKey(day),
    sessions: reports,
    kpis: {
      flowScore,
      flowTrend: flowScore != null && prevAvg != null ? flowScore - prevAvg : null,
      previousAvg: prevAvg,
      switchesPerHour: perHour == null ? null : Math.round(perHour),
      velocity: velocityStatus(perHour),
      deepWorkMs: sum(reports.map((r) => r.deepWorkMs)),
      frictionDebtMs: sum(reports.map((r) => r.frictionDebtMs)),
      totals,
    },
    leaderboard: Object.entries(leaderboardMs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([site, ms]) => ({ site, ms, share: lbTotal ? ms / lbTotal : 0 })),
    episodes: reports.flatMap((r) => r.episodes.map((e) => ({ ...e, sessionId: r.id }))),
    vision: visionDayOf(reports.map((r) => r.vision)),
  };
}

module.exports = { CFG, siteOf, annotate, ambientBucketsOf, sessionReport, dayReport };
