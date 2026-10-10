// Live Vision Sentinel preview (Ctrl+Alt+V): the same on-device models the
// island samples every 7 s, run at ~5 fps with their output drawn over the
// feed. Only runs while this window is open; nothing is recorded.
import { analyze, GazeTracker, H, loadVision, PERSON_MIN, PHONE_MIN, W } from '../lib/vision.js';

const FPS = 5;
const view = document.getElementById('view');
const g = view.getContext('2d');
const SCALE = view.width / W; // 320x240 analysis frame -> 640x480 view
const $ = (id) => document.getElementById(id);

const COLORS = { person: '#34d399', 'cell phone': '#fbbf24' };
const VERDICT = {
  screen: ['VISION SENTINEL: LOCKED', 'ok'],
  down: ['HEAD DOWN', 'warn'],
  side: ['LOOKING AWAY', 'warn'],
  noface: ['NO FACE', 'dim'],
  away: ['NO ONE AT DESK', 'dim'],
};

function drawBox(b, color, faint) {
  const { originX: x, originY: y, width: w, height: h } = b.box;
  g.globalAlpha = faint ? 0.45 : 1;
  g.strokeStyle = color;
  g.lineWidth = faint ? 1 : 2.5;
  g.strokeRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
  const tag = `${b.label} ${Math.round(b.score * 100)}%`;
  g.font = '600 13px ui-monospace, monospace';
  const top = Math.max(0, y * SCALE - 20);
  g.fillStyle = color;
  g.fillRect(x * SCALE, top, g.measureText(tag).width + 10, 20);
  g.fillStyle = '#09090b';
  g.fillText(tag, x * SCALE + 5, top + 14);
  g.globalAlpha = 1;
}

async function main() {
  const [models, stream] = await Promise.all([
    loadVision(),
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }),
  ]);
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  await video.play();

  const frame = document.createElement('canvas');
  frame.width = W;
  frame.height = H;
  const fctx = frame.getContext('2d', { willReadFrequently: true });
  const gaze = new GazeTracker();

  const tick = () => {
    const started = performance.now();
    fctx.drawImage(video, 0, 0, W, H);
    const r = analyze(models, frame);
    const gz = r.person >= PERSON_MIN || r.pose ? gaze.update(r.pose) : 'away';

    g.drawImage(video, 0, 0, view.width, view.height);
    // Face points (every 3rd of 478) so the head tracking is visible.
    if (r.landmarks) {
      g.fillStyle = gz === 'screen' ? 'rgba(56,189,248,0.75)' : 'rgba(251,191,36,0.85)';
      for (let i = 0; i < r.landmarks.length; i += 3) {
        const p = r.landmarks[i];
        g.fillRect(p.x * view.width - 1, p.y * view.height - 1, 2, 2);
      }
    }
    for (const b of r.boxes) {
      const strong =
        (b.label === 'person' && b.score >= PERSON_MIN) || (b.label === 'cell phone' && b.score >= PHONE_MIN);
      drawBox(b, COLORS[b.label] ?? '#a1a1aa', !strong);
    }

    const [text, cls] = r.phone >= PHONE_MIN ? ['PHYSICAL DRIFT: SMARTPHONE DETECTED', 'warn'] : VERDICT[gz];
    $('verdict').textContent = text;
    $('verdict').className = cls;
    $('pose').textContent = r.pose
      ? `pitch ${r.pose.pitch.toFixed(0)}° (usual ${gaze.base.pitch.toFixed(0)}°) · yaw ${r.pose.yaw.toFixed(0)}°`
      : '';
    $('perf').textContent = `inference ${r.ms} ms · ${FPS} fps · on-device`;
    setTimeout(tick, Math.max(0, 1000 / FPS - (performance.now() - started)));
  };
  tick();
}

main().catch((err) => {
  $('verdict').textContent = `CAMERA UNAVAILABLE: ${err.message}`;
  $('verdict').className = 'warn';
});
