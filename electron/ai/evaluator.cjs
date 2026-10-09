// Sprint evaluator: on a slow tick (8-10s) it judges the current foreground
// window against the declared sprint goal using the local model, with a
// deterministic fallback so a dead/slow Ollama can never break the island.
//
// Events:
//   'verdict' (entry)   every evaluation, for status UI and the session log
//   'drift'   (alert)   after DRIFT_STREAK consecutive confident distractions
//   'health'  (status)  Ollama availability changes
const { EventEmitter } = require('node:events');
const ollama = require('./ollama.cjs');
const { heuristicVerdict } = require('./heuristics.cjs');

const DRIFT_STREAK = 2;
const DRIFT_MIN_CONFIDENCE = 0.7;
const REALERT_AFTER_MS = 60_000; // still on the same distraction after dismissing
const HEALTH_EVERY_MS = 30_000;
const DRIFT_TYPES = ['none', 'informational', 'social', 'debugging'];

// What the model is asked for. Field order matters for small models: the
// reason comes first so the model "thinks" before it commits to a boolean, and
// it answers "related?" rather than "distracted?" (1.5B models lean towards
// "yes" on accusatory questions). normalize() maps this onto the app contract
// { isDistracted, confidence, distractingApp, reason, nudge, driftType }.
const SCHEMA = {
  type: 'object',
  properties: {
    reason: { type: 'string' },
    relatedToGoal: { type: 'boolean' },
    confidence: { type: 'number' },
    driftType: { type: 'string', enum: DRIFT_TYPES },
    nudge: { type: 'string' },
  },
  required: ['reason', 'relatedToGoal', 'confidence', 'driftType', 'nudge'],
};

const SYSTEM = `You check whether the window a person is looking at is related to their work goal. Reply with JSON only.

Fields:
- reason: one short sentence saying what the window is about and whether that helps the goal.
- relatedToGoal: true if the window helps with the goal or is a work tool (code editor, terminal, docs, search, Q&A about the topic). false if it is entertainment, social media, video, shopping, games, or chat unrelated to the goal.
- confidence: 0.0 to 1.0.
- driftType: "none" if related. Otherwise "social" (social media, chat, video, entertainment, shopping), "informational" (reading about an unrelated topic), or "debugging" (fighting unrelated tooling or errors).
- nudge: "" if related. Otherwise one friendly sentence, max 12 words, telling the person to leave this window and return to the goal. Never suggest doing anything inside the distracting app.

Examples for the goal "Finish the auth refactor":
Window: [browser] "Lofi hip hop radio - YouTube"
{"reason":"A music video stream, unrelated to the auth refactor.","relatedToGoal":false,"confidence":0.9,"driftType":"social","nudge":"Pause the stream and get back to the auth refactor."}
Window: [browser] "JWT refresh token best practices - Stack Overflow"
{"reason":"Research about JWT tokens, which supports the auth refactor.","relatedToGoal":true,"confidence":0.9,"driftType":"none","nudge":""}
Window: [editor] "login.controller.ts - api - Visual Studio Code"
{"reason":"Editing code in the project, which is the work itself.","relatedToGoal":true,"confidence":0.95,"driftType":"none","nudge":""}`;

function formatPrompt(goal, state) {
  const c = state.current;
  return `Goal: "${goal}"\nWindow: [${c.category}] "${c.title || c.label}"`;
}

// Coerce whatever the model produced into the app's verdict contract, or throw.
function normalize(raw, { goal, current }) {
  if (!raw || typeof raw !== 'object') throw new Error('verdict is not an object');

  let related = raw.relatedToGoal;
  if (typeof related === 'string') related = related.toLowerCase() === 'true';
  if (typeof related !== 'boolean') throw new Error('relatedToGoal missing');
  const isDistracted = !related;

  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  if (confidence > 1 && confidence <= 100) confidence /= 100;
  confidence = Math.min(1, Math.max(0, confidence));

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  return {
    isDistracted,
    confidence,
    distractingApp: isDistracted ? current.label || current.app : '',
    reason: str(raw.reason, 160),
    nudge: isDistracted ? str(raw.nudge, 100) || `Back to "${goal}".` : '',
    driftType: isDistracted
      ? DRIFT_TYPES.includes(raw.driftType) && raw.driftType !== 'none'
        ? raw.driftType
        : 'informational'
      : 'none',
  };
}

const keyOf = (c) => `${c.app}|${c.label}`;

class Evaluator extends EventEmitter {
  constructor({ daemon, intervalMs = 8000, timeoutMs = 8000 }) {
    super();
    this.daemon = daemon;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.timer = null;
    this.healthTimer = null;
    this.busy = false;
    this.health = { status: 'offline', model: ollama.MODEL };
    this.reset(null);
  }

  reset(sprint) {
    this.sprint = sprint;
    this.cache = new Map(); // context key -> verdict (valid for this goal)
    this.allowlist = new Set(); // keys the user marked "It's related"
    this.streak = 0;
    this.alertedKey = null;
    this.alertedAt = 0;
    this.log = [];
  }

  start() {
    this.checkHealth();
    this.healthTimer = setInterval(() => this.checkHealth(), HEALTH_EVERY_MS);
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.healthTimer);
    this.timer = null;
    this.healthTimer = null;
  }

  async checkHealth() {
    const next = await ollama.health();
    if (next.status !== this.health.status) {
      this.health = next;
      this.emit('health', next);
      if (next.status === 'ready' && this.sprint) ollama.warmUp(SYSTEM);
    }
  }

  setSprint(sprint) {
    const sameGoal = sprint && this.sprint && sprint.goal === this.sprint.goal;
    if (!sameGoal) this.reset(sprint);
    else this.sprint = sprint;

    clearInterval(this.timer);
    this.timer = null;
    if (!sprint) return;

    if (this.health.status === 'ready') ollama.warmUp(SYSTEM);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    setTimeout(() => this.tick(), 1500); // first verdict soon after starting
  }

  allow(key) {
    if (!key) return;
    this.allowlist.add(key);
    this.cache.delete(key);
    this.streak = 0;
    this.alertedKey = null;
  }

  async judge(current, state) {
    const key = keyOf(current);
    const goal = this.sprint.goal;

    // Idle desktops and dev tools (editor/terminal) are decided by rules: the
    // tools ARE the work, and it spares an inference every tick.
    if (['idle', 'editor', 'terminal'].includes(current.category)) {
      return { ...heuristicVerdict({ goal, current }), source: 'rules', latencyMs: 0 };
    }
    if (this.allowlist.has(key)) {
      return {
        isDistracted: false,
        confidence: 1,
        distractingApp: '',
        reason: 'Marked as related by you.',
        nudge: '',
        driftType: 'none',
        source: 'allowlist',
        latencyMs: 0,
      };
    }
    const cached = this.cache.get(key);
    if (cached) return { ...cached, source: 'cache', latencyMs: 0 };

    if (this.health.status === 'ready') {
      try {
        const { data, latencyMs } = await ollama.generateJson({
          system: SYSTEM,
          prompt: formatPrompt(goal, state),
          schema: SCHEMA,
          timeoutMs: this.timeoutMs,
        });
        const verdict = { ...normalize(data, { goal, current }), source: 'model', latencyMs };
        this.cache.set(key, verdict);
        return verdict;
      } catch (err) {
        this.emit('model-error', err);
        this.checkHealth();
      }
    }
    return { ...heuristicVerdict({ goal, current }), source: 'rules', latencyMs: 0 };
  }

  async tick() {
    if (!this.sprint || this.busy) return;
    const state = this.daemon?.getState();
    const current = state?.current;
    if (!current) return;

    this.busy = true;
    try {
      const sprint = this.sprint;
      const verdict = await this.judge(current, state);
      if (this.sprint !== sprint) return; // sprint changed while we were waiting

      const key = keyOf(current);
      const entry = {
        at: Date.now(),
        key,
        app: current.app,
        label: current.label,
        title: current.title,
        category: current.category,
        ...verdict,
      };
      this.log.push(entry);
      this.emit('verdict', entry);

      const confident = verdict.isDistracted && verdict.confidence >= DRIFT_MIN_CONFIDENCE;
      this.streak = confident ? this.streak + 1 : 0;
      if (!confident) this.alertedKey = null;

      const fresh = this.alertedKey !== key || entry.at - this.alertedAt >= REALERT_AFTER_MS;
      if (this.streak >= DRIFT_STREAK && fresh) {
        this.alertedKey = key;
        this.alertedAt = entry.at;
        this.emit('drift', entry);
      }
    } finally {
      this.busy = false;
    }
  }
}

module.exports = { Evaluator, normalize, formatPrompt, SYSTEM, SCHEMA };
