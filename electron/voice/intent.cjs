// Spoken request -> sprint: { goal, durationMin, domain }. The duration comes
// from deterministic parsing when the words are there ("30 minutes", "an hour
// and a half"); the local model rewrites the rest into a short goal title.
// Without Ollama, the transcript itself is cleaned up into the goal.

const DEFAULT_MIN = 25;
const MAX_MIN = 240;
const DOMAINS = ['Frontend', 'Backend', 'Database', 'DevOps', 'Testing', 'Docs', 'Design', 'Research', 'Other'];

const UNITS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUM_WORD = `(?:${[...Object.keys(TENS)].join('|')})(?:[\\s-](?:${Object.keys(UNITS).filter((w) => UNITS[w] < 10 && w.length > 2).join('|')}))?|${Object.keys(UNITS).join('|')}`;
const NUM = `(\\d+(?:\\.\\d+)?|${NUM_WORD})`;

function wordToNumber(w) {
  const s = w.toLowerCase().trim();
  if (/^\d/.test(s)) return Number(s);
  const [a, b] = s.split(/[\s-]+/);
  if (TENS[a] != null) return TENS[a] + (b ? UNITS[b] ?? 0 : 0);
  return UNITS[a] ?? NaN;
}

// Patterns are tried in order; each match is removed before the next one runs.
const PATTERNS = [
  [/\b(?:an?|one)\s+hour\s+and\s+a\s+half\b/i, () => 90],
  [new RegExp(`\\b${NUM}\\s+and\\s+a\\s+half\\s+hours?\\b`, 'i'), (m) => wordToNumber(m[1]) * 60 + 30],
  [/\b(?:half\s+an\s+hour|half\s+hour|thirty\s+mins?)\b/i, () => 30],
  [/\b(?:a\s+)?quarter\s+(?:of\s+an\s+)?hour\b/i, () => 15],
  // Single-letter units only straight after digits ("2h", "45m"), so the
  // "a m" in "I am" is never a minute.
  [/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i, (m) => Number(m[1]) * 60],
  [new RegExp(`\\b${NUM}\\s+(?:hours?|hrs?)\\b`, 'i'), (m) => wordToNumber(m[1]) * 60],
  [/\b(?:an|one)\s+hour\b/i, () => 60],
  [/\b(\d+)\s*(?:minutes?|mins?|m)\b/i, (m) => Number(m[1])],
  // ...and "a minute" is never a sprint length ("fix a minute rounding bug").
  [new RegExp(`\\b(?!an?\\s)${NUM}\\s+(?:minutes?|mins?)\\b`, 'i'), (m) => wordToNumber(m[1])],
];

// -> { minutes, rest } where rest is the text with the duration phrases removed.
function parseDuration(text = '') {
  let rest = text;
  let minutes = 0;
  let found = false;
  for (const [re, toMin] of PATTERNS) {
    const m = rest.match(re);
    if (!m) continue;
    const v = toMin(m);
    if (!Number.isFinite(v) || v <= 0) continue;
    minutes += v;
    found = true;
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
  }
  return { minutes: found ? Math.round(minutes) : null, rest: rest.replace(/\s+/g, ' ').trim() };
}

const clampMin = (v) => Math.max(1, Math.min(MAX_MIN, Math.round(v)));

// Strip the spoken scaffolding around the actual task.
const LEAD_INS =
  /^(?:(?:ok(?:ay)?|so|alright|hey|um+|uh+)[,\s]+)*(?:let'?s|let\s+me|i\s+(?:want|need|have|'?m\s+going|am\s+going|'?ll)\s+to|i'?ll|give\s+me|help\s+me|time\s+to|we\s+(?:need|have)\s+to|i\s+want|spend|work\s+on|focus\s+on|for)\b[\s,]*/i;
function cleanGoal(text = '') {
  let g = text.trim();
  for (let i = 0; i < 4; i++) {
    const next = g.replace(LEAD_INS, '').replace(/^(?:spend|work\s+on|focus\s+on|for|on|of|to|and)\b[\s,]*/i, '');
    if (next === g) break;
    g = next;
  }
  g = g
    .replace(/\s+(?:for|in)\s*$/i, '')
    .replace(/^[\s,.;:-]+|[\s,.;:!?-]+$/g, '')
    .replace(/\s+/g, ' ');
  if (g.length > 80) g = `${g.slice(0, 79).replace(/\s+\S*$/, '')}…`;
  return g ? g[0].toUpperCase() + g.slice(1) : '';
}

const SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string' },
    durationMinutes: { type: 'integer' },
    domain: { type: 'string', enum: DOMAINS },
  },
  required: ['goal', 'durationMinutes', 'domain'],
};

const SYSTEM = `You turn a developer's spoken request into a focus sprint. Reply with JSON only.
- goal: a short task title (max 8 words), imperative, sentence case, no time phrases, keep technical names exactly as spoken. Use "&" to join two tasks.
- durationMinutes: the length they asked for in minutes, or 0 if they did not say one.
- domain: the closest area of work.

Examples:
"Let's spend 30 minutes refactoring the Drizzle schema and fixing the migration."
{"goal":"Refactor Drizzle schema & fix migration","durationMinutes":30,"domain":"Database"}
"okay I need to write the README for the hackathon"
{"goal":"Write the hackathon README","durationMinutes":0,"domain":"Docs"}
"give me an hour to build the settings page in React"
{"goal":"Build the React settings page","durationMinutes":60,"domain":"Frontend"}`;

async function extractIntent(transcript, { ollama, ready, timeoutMs = 6000 } = {}) {
  const text = (transcript || '').trim();
  const parsed = parseDuration(text);
  const rulesGoal = cleanGoal(parsed.rest);

  if (ready && ollama && text) {
    try {
      const { data, latencyMs } = await ollama.generateJson({
        system: SYSTEM,
        prompt: JSON.stringify(text),
        schema: SCHEMA,
        timeoutMs,
        numPredict: 80,
      });
      const goal = typeof data.goal === 'string' ? data.goal.replace(/^["'\s]+|["'\s.]+$/g, '').slice(0, 80) : '';
      // Under 5 minutes is a misread ("a minute bug"), not a sprint.
      const modelMin = Number.isFinite(data.durationMinutes) && data.durationMinutes >= 5 ? data.durationMinutes : null;
      if (goal) {
        return {
          goal,
          // Parsed words beat the model: small models drift on arithmetic.
          durationMin: clampMin(parsed.minutes ?? modelMin ?? DEFAULT_MIN),
          durationSaid: parsed.minutes != null || modelMin != null,
          domain: DOMAINS.includes(data.domain) && data.domain !== 'Other' ? data.domain : null,
          transcript: text,
          source: 'model',
          latencyMs,
        };
      }
    } catch {
      // fall through to the rules
    }
  }
  return {
    goal: rulesGoal || text.slice(0, 80),
    durationMin: clampMin(parsed.minutes ?? DEFAULT_MIN),
    durationSaid: parsed.minutes != null,
    domain: null,
    transcript: text,
    source: 'rules',
    latencyMs: 0,
  };
}

module.exports = { parseDuration, cleanGoal, extractIntent, wordToNumber, DOMAINS, DEFAULT_MIN };
