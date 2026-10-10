// Minimal Ollama client. Everything goes to loopback — nothing leaves the
// machine. Pure Node (global fetch), so scripts can use it without Electron.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.TETHER_MODEL || 'qwen2.5:1.5b';
// Unload the model after 5 idle minutes so it isn't holding RAM/VRAM between sprints.
const KEEP_ALIVE = '5m';

async function request(path, { body, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama ${path} -> HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Ollama ${path} timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 'ready' | 'missing-model' | 'offline'
async function health() {
  try {
    const { models = [] } = await request('/api/tags', { timeoutMs: 1500 });
    const have = models.some((m) => m.name === MODEL || m.model === MODEL);
    return { status: have ? 'ready' : 'missing-model', model: MODEL };
  } catch {
    return { status: 'offline', model: MODEL };
  }
}

// Strict structured output: `format` is a JSON schema, so the model can only
// emit matching JSON. Throws on transport errors or unparseable output —
// callers own the fallback.
async function generateJson({ system, prompt, schema, timeoutMs = 8000, numPredict = 160 }) {
  const started = Date.now();
  const body = await request('/api/generate', {
    timeoutMs,
    body: {
      model: MODEL,
      system,
      prompt,
      format: schema ?? 'json',
      stream: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: 0, num_predict: numPredict, num_ctx: 2048 },
    },
  });
  return {
    data: JSON.parse(body.response),
    latencyMs: Date.now() - started,
  };
}

// Load the model and pre-process the system prompt ahead of the first real
// evaluation, so the first verdict doesn't pay the multi-second cold start.
async function warmUp(system) {
  try {
    await request('/api/generate', {
      timeoutMs: 60_000,
      body: {
        model: MODEL,
        system,
        prompt: 'Goal: "warm up"\nWindow: [other] "warm up"',
        keep_alive: KEEP_ALIVE,
        stream: false,
        options: { temperature: 0, num_predict: 1, num_ctx: 2048 },
      },
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = { MODEL, health, generateJson, warmUp };
