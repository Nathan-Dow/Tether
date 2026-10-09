// One-time Vision Sentinel setup: copies the MediaPipe Tasks wasm runtime out
// of node_modules and downloads the EfficientDet-Lite0 object detector (COCO:
// includes "person" and "cell phone") into public/vision. After this, webcam
// corroboration runs fully offline. Usage: npm run setup:vision
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'public', 'vision');
const WASM_SRC = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
const MODEL_PATH = path.join(OUT, 'efficientdet_lite0.tflite');

async function main() {
  fs.mkdirSync(path.join(OUT, 'wasm'), { recursive: true });
  fs.cpSync(WASM_SRC, path.join(OUT, 'wasm'), { recursive: true });
  console.log('Copied MediaPipe wasm runtime');

  if (fs.existsSync(MODEL_PATH)) return console.log('Detector model already downloaded');
  process.stdout.write('Downloading efficientdet_lite0.tflite... ');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`${MODEL_URL} -> HTTP ${res.status}`);
  fs.writeFileSync(MODEL_PATH, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(MODEL_PATH).size / 1e6).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
