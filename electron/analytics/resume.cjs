// Resume Flow: after an interruption (a rabbit hole or time away), rebuild
// where you were from the last 15 minutes of the sprint - active file, last
// terminal command, references, goal - and write a short "welcome back"
// note plus a copyable resume prompt. Everything is computed on-device.
const { annotate } = require('./metrics.cjs');

const MIN = 60_000;
const WINDOW_MS = 15 * MIN;

// "● auth.service.ts - api - Visual Studio Code" -> { file, project }
function parseEditorTitle(title = '') {
  const t = title.replace(/^[\u25cf\u2022*]\s*/, '').trim();
  const parts = t.split(/\s[-\u2013\u2014]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { file: parts[0], project: parts[1] };
  if (parts.length === 2) return { file: parts[0], project: null };
  return { file: null, project: null };
}

// Terminal titles show the running command - unless they only show the shell.
const SHELL_ONLY =
  /^(administrator:\s*)?(windows powershell|powershell|pwsh|command prompt|cmd|bash|zsh|fish|ubuntu|terminal|git bash|mingw64)$/i;
function parseTerminalTitle(title = '') {
  const t = title.trim();
  if (!t || SHELL_ONLY.test(t) || /\.exe$/i.test(t) || /^[a-z]:\\/i.test(t) || /^[~/]/.test(t)) return null;
  return t;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function buildSnapshot(session, { now = Date.now(), windowMs = WINDOW_MS, labels } = {}) {
  const { segments } = annotate({ ...session, endedAt: Math.min(now, session.endedAt ?? now) }, { labels });

  // The interruption: the latest run of off-task segments (skipping the
  // on-task moments since you came back).
  let i = segments.length - 1;
  while (i >= 0 && (segments[i].state === 'focus' || segments[i].state === 'debug')) i--;
  const run = [];
  while (i >= 0 && (segments[i].state === 'drift' || segments[i].state === 'idle')) run.unshift(segments[i--]);
  let interruption = null;
  if (run.length) {
    const drift = run.filter((s) => s.state === 'drift');
    const siteMs = {};
    for (const s of drift) siteMs[s.site] = (siteMs[s.site] || 0) + s.ms;
    const top = Object.entries(siteMs).sort((a, b) => b[1] - a[1])[0];
    interruption = {
      start: run[0].start,
      ms: sum(run.map((s) => s.ms)),
      kind: drift.length ? 'drift' : 'away',
      site: top ? top[0] : null,
    };
  }

  // "Where you left off" = the work before the interruption: the 15 minutes
  // leading up to it, falling back to earlier in the sprint if needed.
  const cutoff = interruption ? interruption.start : now;
  const before = segments.filter((s) => s.start < cutoff);
  const recent = before.filter((s) => s.end > cutoff - windowMs);
  const latest = (pred) => [...recent].reverse().find(pred) ?? [...before].reverse().find(pred);
  const editor = latest((s) => s.category === 'editor' && parseEditorTitle(s.title).file);
  const terminal = latest((s) => s.category === 'terminal' && parseTerminalTitle(s.title));

  // Pages that supported the work (on-task browser time), most-used first.
  const refMs = {};
  for (const s of recent) {
    if (s.category === 'browser' && s.state === 'focus') refMs[s.label] = (refMs[s.label] || 0) + s.ms;
  }
  const references = Object.entries(refMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);

  const { file, project } = editor ? parseEditorTitle(editor.title) : { file: null, project: null };
  return {
    goal: session.goal,
    at: now,
    file,
    project,
    editor: editor?.app ?? null,
    command: terminal ? parseTerminalTitle(terminal.title) : null,
    failing: Boolean(terminal?.errorSignal),
    references,
    interruption,
  };
}

const fmtMin = (ms) => `${Math.max(1, Math.round(ms / MIN))}m`;

// The copyable prompt: plain facts, ready to paste into notes or an assistant.
function resumePrompt(s) {
  const lines = ['Resume context (Tether, last 15 minutes)', `Goal: ${s.goal}`];
  if (s.file) lines.push(`Active file: ${s.file}${s.project ? ` (${s.project})` : ''}`);
  if (s.command) lines.push(`Last terminal command: ${s.command}${s.failing ? ' (failing)' : ''}`);
  if (s.references.length) lines.push(`Recently referenced: ${s.references.join('; ')}`);
  if (s.interruption) {
    lines.push(
      s.interruption.kind === 'drift'
        ? `Interrupted by: ${s.interruption.site ?? 'a distraction'} for ${fmtMin(s.interruption.ms)}`
        : `Away from the keyboard for ${fmtMin(s.interruption.ms)}`,
    );
  }
  lines.push('', 'Help me pick up exactly where I left off.');
  return lines.join('\n');
}

// Deterministic fallback for when the local model is unavailable.
function templateNote(s) {
  const where = s.file ? `editing ${s.file}${s.project ? ` in ${s.project}` : ''}` : `working on "${s.goal}"`;
  const cmd = s.command ? `, and last ran \`${s.command}\`${s.failing ? ' (it was failing)' : ''}` : '';
  const nextStep = s.failing
    ? `Re-run \`${s.command}\` and fix the first failure.`
    : s.file
      ? `Reopen ${s.file} and continue "${s.goal}".`
      : `Pick up "${s.goal}" where you left it.`;
  return { summary: `You were ${where}${cmd}.`, nextStep };
}

const NOTE_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, nextStep: { type: 'string' } },
  required: ['summary', 'nextStep'],
};

const NOTE_SYSTEM = `You write a short "welcome back" note that helps a developer resume work after an interruption. Use ONLY the facts given - never invent file names, commands, errors or tools. Reply with JSON only.
- summary: one or two short sentences (max 30 words), second person, past tense, saying what they were doing.
- nextStep: one imperative sentence (max 14 words) with the most sensible next action.`;

// Model-written note with a strict schema; template on any failure.
async function writeNote(snapshot, { ollama, ready, timeoutMs = 5000 }) {
  if (ready) {
    try {
      const { data, latencyMs } = await ollama.generateJson({
        system: NOTE_SYSTEM,
        prompt: resumePrompt(snapshot),
        schema: NOTE_SCHEMA,
        timeoutMs,
        numPredict: 120,
      });
      // Small models sometimes echo the prompt header ("Last 15 minutes: ...").
      const summary =
        typeof data.summary === 'string'
          ? data.summary.replace(/^\s*(last|in the last)\s+\d+\s+minutes?\s*[:,-]\s*/i, '').trim().slice(0, 220)
          : '';
      const nextStep = typeof data.nextStep === 'string' ? data.nextStep.trim().slice(0, 140) : '';
      if (summary && nextStep) return { summary, nextStep, source: 'model', latencyMs };
    } catch {
      // fall through to the template
    }
  }
  return { ...templateNote(snapshot), source: 'rules', latencyMs: 0 };
}

// Fires once when you come back on-task after being off-task for minAwayMs.
class ResumeTracker {
  constructor({ minAwayMs = 5 * MIN } = {}) {
    this.minAwayMs = minAwayMs;
    this.offSince = null;
  }

  reset() {
    this.offSince = null;
  }

  // offSince lets callers backdate (e.g. idle detected 2 minutes after leaving).
  update({ at, onTask, offSince = at }) {
    if (!onTask) {
      if (this.offSince == null) this.offSince = offSince;
      return null;
    }
    if (this.offSince == null) return null;
    const awayMs = at - this.offSince;
    this.offSince = null;
    return awayMs >= this.minAwayMs ? { awayMs } : null;
  }
}

module.exports = {
  parseEditorTitle,
  parseTerminalTitle,
  buildSnapshot,
  resumePrompt,
  templateNote,
  writeNote,
  ResumeTracker,
};
