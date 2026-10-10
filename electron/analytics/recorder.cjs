// Records one sprint: focus segments (from the context daemon), verdicts and
// drift alerts (from the evaluator). Autosaves so a crash or force-quit
// mid-sprint loses at most AUTOSAVE_MS of history.
const AUTOSAVE_MS = 30_000;
const AWAY_AFTER_S = 120; // no keyboard/mouse input for this long = away

const keyOf = (c) => `${c.app}|${c.label}`;

const AWAY = { app: 'Away', label: 'Away', title: '', category: 'idle', process: '' };

class SessionRecorder {
  // getIdleSeconds: () => seconds since last user input (Electron powerMonitor).
  constructor({ store, getIdleSeconds = () => 0 }) {
    this.store = store;
    this.getIdleSeconds = getIdleSeconds;
    this.session = null;
    this.timer = null;
  }

  get active() {
    return Boolean(this.session);
  }

  start(sprint) {
    if (this.session?.startedAt === sprint.startedAt) return; // same sprint
    this.finish();
    const d = new Date(sprint.startedAt);
    const pad = (n) => String(n).padStart(2, '0');
    this.session = {
      version: 1,
      id: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
      goal: sprint.goal,
      mode: sprint.mode === 'ambient' ? 'ambient' : 'sprint',
      durationMin: sprint.durationMin ?? null, // null in Ambient Mode: no timer
      startedAt: sprint.startedAt,
      endedAt: null,
      segments: [],
      verdicts: [],
      alerts: [],
      allowed: [],
      phone: [], // Vision Sentinel: physical drift { start, end, source, cause }
    };
    this.timer = setInterval(() => this.save(), AUTOSAVE_MS);
  }

  // Ends the current sprint and returns the saved session (or null).
  finish(now = Date.now()) {
    clearInterval(this.timer);
    this.timer = null;
    const s = this.session;
    if (!s) return null;
    this.session = null;
    s.endedAt = s.durationMin ? Math.min(now, s.startedAt + s.durationMin * 60_000) : now;
    const last = s.segments.at(-1);
    if (last) last.end = Math.max(last.end, s.endedAt);
    const pickup = s.phone?.at(-1);
    if (pickup && pickup.end == null) pickup.end = s.endedAt;
    this.store.save(s);
    return s;
  }

  save() {
    if (this.session) this.store.save(this.session);
  }

  onContext(current, now = Date.now()) {
    const s = this.session;
    if (!s || !current) return;
    const ctx = this.getIdleSeconds() >= AWAY_AFTER_S ? AWAY : current;
    const key = keyOf(ctx);
    const open = s.segments.at(-1);

    // Same window and same error state: extend. A terminal that starts
    // failing becomes a new segment so debug time isn't smeared backwards.
    if (open && open.key === key && open.errorSignal === Boolean(ctx.errorSignal)) {
      open.end = now;
      return;
    }
    if (open) open.end = now;
    s.segments.push({
      key,
      start: now,
      end: now,
      app: ctx.app,
      label: ctx.label,
      title: ctx.title,
      category: ctx.category,
      errorSignal: Boolean(ctx.errorSignal),
    });
  }

  onVerdict(entry) {
    if (!this.session) return;
    const { at, key, isDistracted, confidence, driftType, source, latencyMs, reason } = entry;
    this.session.verdicts.push({ at, key, isDistracted, confidence, driftType, source, latencyMs, reason });
  }

  onAlert(entry) {
    this.session?.alerts.push({ at: entry.at, key: entry.key });
  }

  // Vision Sentinel: the webcam saw a phone come up or go away.
  // cause: 'phone' (in frame) | 'head-down' (looking down a while: phone in lap?)
  onPhone({ phoneDetected, source = 'camera', cause = 'phone' }, now = Date.now()) {
    const s = this.session;
    if (!s) return;
    s.phone ??= [];
    const open = s.phone.at(-1);
    if (phoneDetected && !(open && open.end == null)) s.phone.push({ start: now, end: null, source, cause });
    else if (!phoneDetected && open && open.end == null) open.end = now;
  }

  // Vision Sentinel samples: { at, present, gaze } every ~7 s, or
  // { status: 'on' | 'unavailable' } when the sampler starts or can't.
  onVisionSample(sample = {}) {
    const s = this.session;
    if (!s) return;
    s.vision ??= { enabled: true, samples: [] };
    if (sample.status === 'unavailable') s.vision.cameraError = true;
    if (typeof sample.present === 'boolean' && sample.gaze) {
      s.vision.samples.push({ at: sample.at ?? Date.now(), present: sample.present, gaze: sample.gaze });
    }
  }

  onAllow(key) {
    this.session?.allowed.push({ at: Date.now(), key });
  }
}

module.exports = { SessionRecorder, keyOf };
