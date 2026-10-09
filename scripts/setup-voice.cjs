// One-time voice setup: downloads the whisper.cpp CLI (Windows x64, CPU) and
// the quantized Whisper base.en model into vendor/whisper. After this, speech
// recognition runs fully offline. Usage: npm run setup:voice
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WHISPER_DIR, CLI_PATH, MODEL_PATH } = require('../electron/voice/stt.cjs');

// Pinned to a release that has been out for a while (v1.9.4).
const CLI_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin';
const MODEL_BYTES = 59_721_011;

async function download(url, file) {
  process.stdout.write(`Downloading ${path.basename(file)}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Voice setup is Windows-only for now.');
  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });

  if (!fs.existsSync(CLI_PATH)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tether-whisper-'));
    const zip = path.join(tmp, 'whisper.zip');
    await download(CLI_URL, zip);
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${tmp}' -Force`,
    ]);
    fs.cpSync(path.join(tmp, 'Release'), path.dirname(CLI_PATH), { recursive: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  } else {
    console.log('whisper-cli already installed');
  }

  if (!fs.existsSync(MODEL_PATH) || fs.statSync(MODEL_PATH).size !== MODEL_BYTES) {
    await download(MODEL_URL, MODEL_PATH);
    if (fs.statSync(MODEL_PATH).size !== MODEL_BYTES) throw new Error('Model download is incomplete.');
  } else {
    console.log('Whisper model already installed');
  }
  console.log(`Voice ready in ${WHISPER_DIR}`);
}

main().catch((err) => {
  console.error(`\nVoice setup failed: ${err.message}`);
  process.exit(1);
});
