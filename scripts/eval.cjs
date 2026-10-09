// `npm run eval` — runs fixed window scenarios through the local model and
// reports accuracy + latency. Use it to sanity-check prompt changes and to get
// honest latency numbers for the README.
const ollama = require('../electron/ai/ollama.cjs');
const { SYSTEM, SCHEMA, formatPrompt, normalize } = require('../electron/ai/evaluator.cjs');
const { heuristicVerdict } = require('../electron/ai/heuristics.cjs');

const RULES_ONLY = new Set(['idle', 'editor', 'terminal']); // mirrors Evaluator.judge

const GOAL = 'Finish the auth refactor';

const win = (category, app, title) => ({ category, app, label: title, title });

// [window, expected isDistracted]
const CASES = [
  [win('browser', 'Google Chrome', 'Lofi hip hop radio - beats to relax/study to - YouTube'), true],
  [win('browser', 'Google Chrome', 'r/pcmasterrace - Reddit'), true],
  [win('chat', 'Discord', '#general | Gaming Squad - Discord'), true],
  [win('browser', 'Google Chrome', 'Shopee Philippines | Mechanical keyboards'), true],
  [win('browser', 'Google Chrome', 'Home / X'), true],
  [win('editor', 'VS Code', 'auth.service.ts - tether - Visual Studio Code'), false],
  [win('terminal', 'Terminal', 'npm test -- auth'), false],
  [win('browser', 'Google Chrome', 'JWT refresh token rotation - Stack Overflow'), false],
  [win('browser', 'Google Chrome', 'Passport.js documentation - Strategies'), false],
  [win('browser', 'Google Chrome', 'OAuth 2.0 Authorization Code Flow - Auth0 Docs'), false],
];

async function main() {
  const health = await ollama.health();
  console.log(`Model ${health.model}: ${health.status}`);
  if (health.status !== 'ready') {
    console.log('Ollama not ready; showing rules-only results.\n');
  } else {
    process.stdout.write('Warming up… ');
    const t = Date.now();
    await ollama.warmUp(SYSTEM);
    console.log(`${Date.now() - t}ms\n`);
  }

  let correct = 0;
  const latencies = [];

  for (const [current, expected] of CASES) {
    const state = { current, focusedForMs: 30_000, recent: [current] };
    let verdict;
    let source = 'rules';
    if (health.status === 'ready' && !RULES_ONLY.has(current.category)) {
      try {
        const { data, latencyMs } = await ollama.generateJson({
          system: SYSTEM,
          prompt: formatPrompt(GOAL, state),
          schema: SCHEMA,
          timeoutMs: 15_000,
        });
        verdict = normalize(data, { goal: GOAL, current });
        latencies.push(latencyMs);
        source = `${latencyMs}ms`;
      } catch (err) {
        source = `rules (model failed: ${err.message})`;
      }
    }
    verdict ??= heuristicVerdict({ goal: GOAL, current });

    const ok = verdict.isDistracted === expected;
    correct += ok;
    const mark = ok ? 'PASS' : 'FAIL';
    const what = verdict.isDistracted
      ? `DRIFT ${Math.round(verdict.confidence * 100)}% [${verdict.driftType}] "${verdict.nudge}"`
      : `aligned ${Math.round(verdict.confidence * 100)}%`;
    console.log(`${mark}  ${current.title.slice(0, 48).padEnd(48)}  ${what}  (${source})`);
  }

  console.log(`\nAccuracy: ${correct}/${CASES.length}`);
  if (latencies.length) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(`Latency: median ${median}ms, min ${sorted[0]}ms, max ${sorted.at(-1)}ms`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
