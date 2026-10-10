// Speech-to-text with whisper.cpp (Whisper base.en, quantized) running as a
// local child process - the same pattern as the PowerShell window probe. The
// recording only ever exists in memory and in one temp WAV that is deleted as
// soon as the transcript is back. Install with `npm run setup:voice`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

// The installed app ships vendor/whisper next to app.asar (an .exe can't run from inside it).
const VENDOR = process.resourcesPath && !process.defaultApp
  ? path.join(process.resourcesPath, 'vendor')
  : path.join(__dirname, '..', '..', 'vendor');
const WHISPER_DIR = process.env.TETHER_WHISPER_DIR || path.join(VENDOR, 'whisper');
const CLI_PATH = path.join(WHISPER_DIR, 'bin', 'whisper-cli.exe');
const MODEL_PATH = path.join(WHISPER_DIR, 'models', 'ggml-base.en-q5_1.bin');
const SAMPLE_RATE = 16_000; // what Whisper expects
// Spelling hints for developer words Whisper otherwise mishears
// ("cloud code" for Claude Code).
const VOCAB = 'Sprint goal for a developer: Claude Code, VS Code, GitHub, README, API, auth, OAuth, JWT, Ollama, React, Next.js, Drizzle, Postgres, TypeScript, npm, Electron.';

function status() {
  if (process.platform !== 'win32') return { ready: false, reason: 'unsupported' };
  if (!fs.existsSync(CLI_PATH) || !fs.existsSync(MODEL_PATH)) return { ready: false, reason: 'missing' };
  return { ready: true };
}

// Float32 samples in [-1, 1] -> 16-bit PCM mono WAV.
function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Whisper marks silence and noise with bracketed tags; drop them.
function cleanTranscript(raw) {
  return raw
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Whisper encodes a padded 30 s window (1500 frames, 50 per second). Clips
// here are short, so encoding only what the clip needs is 2-3x faster.
function audioCtxFor(seconds) {
  return Math.min(1500, Math.max(256, Math.ceil(seconds * 50) + 64));
}

function runCli(wavPath, seconds, timeoutMs) {
  const threads = String(Math.max(1, Math.min(8, os.cpus().length - 2)));
  const args = ['-m', MODEL_PATH, '-f', wavPath, '-l', 'en', '-t', threads, '-ac', String(audioCtxFor(seconds)), '--prompt', VOCAB, '-nt', '-np'];
  return new Promise((resolve, reject) => {
    execFile(CLI_PATH, args, { timeout: timeoutMs, windowsHide: true, cwd: path.dirname(CLI_PATH) }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

// samples: Float32Array (or array) at 16 kHz mono, or a path to a WAV file.
async function transcribe(input, { timeoutMs = 15_000 } = {}) {
  const st = status();
  if (!st.ready) throw new Error(`speech model ${st.reason}`);
  const started = Date.now();
  const ownFile = typeof input !== 'string';
  const wavPath = ownFile ? path.join(os.tmpdir(), `tether-voice-${process.pid}-${started}.wav`) : input;
  try {
    if (ownFile) fs.writeFileSync(wavPath, encodeWav(input));
    // 16-bit mono: 2 bytes per sample after the 44-byte header.
    const seconds = (fs.statSync(wavPath).size - 44) / 2 / SAMPLE_RATE;
    const text = cleanTranscript(await runCli(wavPath, seconds, timeoutMs));
    return { text, latencyMs: Date.now() - started };
  } finally {
    if (ownFile) fs.rmSync(wavPath, { force: true });
  }
}

module.exports = { WHISPER_DIR, CLI_PATH, MODEL_PATH, SAMPLE_RATE, status, encodeWav, cleanTranscript, audioCtxFor, transcribe };
