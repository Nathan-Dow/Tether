// One-time Vision Sentinel setup: copies the MediaPipe Tasks wasm runtime out
// of node_modules and downloads the EfficientDet-Lite0 object detector (COCO:
// includes "person" and "cell phone") plus the Face Landmarker (head pose)
// into public/vision. After this, webcam
// corroboration runs fully offline. Usage: npm run setup:vision
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'public', 'vision');
const WASM_SRC = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
const MODEL_PATH = path.join(OUT, 'efficientdet_lite0.tflite');
const FACE_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FACE_PATH = path.join(OUT, 'face_landmarker.task');

async function download(url, file) {
  if (fs.existsSync(file)) return console.log(`${path.basename(file)} already downloaded`);
  process.stdout.write(`Downloading ${path.basename(file)}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'wasm'), { recursive: true });
  fs.cpSync(WASM_SRC, path.join(OUT, 'wasm'), { recursive: true });
  console.log('Copied MediaPipe wasm runtime');

  await download(MODEL_URL, MODEL_PATH);
  await download(FACE_URL, FACE_PATH);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
