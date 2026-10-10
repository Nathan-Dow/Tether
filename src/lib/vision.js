// Shared on-device vision for the Vision Sentinel (island sampler) and the
// live preview window. Two MediaPipe tasks run on the same downscaled frame:
//   - EfficientDet-Lite0 object detector (COCO): "person", "cell phone"
//   - Face Landmarker: 478 face points, used for a rough head pose
// Everything runs in the renderer; frames are never stored or sent anywhere.
export const W = 320;
export const H = 240;

export const PERSON_MIN = 0.5;
export const PHONE_MIN = 0.35;
const DOWN_DEG = 18; // head pitched this far below your usual screen pose
const SIDE_DEG = 28; // head turned this far from your usual screen pose

const asset = (p) => new URL(p, document.baseURI).href;

let loading = null;
export function loadVision() {
  loading ??= import('@mediapipe/tasks-vision').then(async ({ FilesetResolver, ObjectDetector, FaceLandmarker }) => {
    const fileset = await FilesetResolver.forVisionTasks(asset('vision/wasm'));
    const [objects, face] = await Promise.all([
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('vision/efficientdet_lite0.tflite'), delegate: 'CPU' },
        runningMode: 'IMAGE',
        scoreThreshold: 0.25,
        maxResults: 8,
      }),
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('vision/face_landmarker.task'), delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      }),
    ]);
    return { objects, face };
  });
  loading.catch(() => {
    loading = null; // let the next attempt retry
  });
  return loading;
}

const deg = (rad) => (rad * 180) / Math.PI;

// Head pose from 3D landmarks (z is depth, roughly in x units). Positive
// pitch = chin further from the camera than the forehead = looking down.
// Positive yaw = turned toward the image's right.
function headPose(lm) {
  const forehead = lm[10];
  const chin = lm[152];
  const left = lm[234];
  const right = lm[454];
  const pitch = deg(Math.atan2(chin.z - forehead.z, (chin.y - forehead.y) * (H / W)));
  const yaw = deg(Math.atan2(left.z - right.z, right.x - left.x));
  return { pitch, yaw };
}

// Learns your usual "looking at the screen" pose (webcams sit above the
// screen, so that's rarely 0°) and classifies each sample against it.
export class GazeTracker {
  constructor() {
    this.base = null; // { pitch, yaw }
  }

  update(pose) {
    if (!pose) return 'noface';
    if (!this.base) this.base = { pitch: clamp(pose.pitch, -15, 15), yaw: clamp(pose.yaw, -15, 15) };
    const dp = pose.pitch - this.base.pitch;
    const dy = pose.yaw - this.base.yaw;
    const gaze = dp > DOWN_DEG ? 'down' : Math.abs(dy) > SIDE_DEG ? 'side' : 'screen';
    if (gaze === 'screen') {
      this.base.pitch += 0.15 * dp;
      this.base.yaw += 0.15 * dy;
    }
    return gaze;
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Runs both models on a W x H canvas.
export function analyze(models, canvas) {
  const t0 = performance.now();
  const objects = models.objects.detect(canvas);
  const faces = models.face.detect(canvas);
  const ms = Math.round(performance.now() - t0);

  const boxes = objects.detections.map((d) => ({
    label: d.categories[0].categoryName,
    score: d.categories[0].score,
    box: d.boundingBox, // { originX, originY, width, height } in pixels
  }));
  const top = (name) => Math.max(0, ...boxes.filter((b) => b.label === name).map((b) => b.score));
  const landmarks = faces.faceLandmarks[0] ?? null;

  return {
    ms,
    boxes,
    person: top('person'),
    phone: top('cell phone'),
    landmarks,
    pose: landmarks ? headPose(landmarks) : null,
  };
}

export function describe(r, gaze) {
  const pose = r.pose ? ` pitch:${r.pose.pitch.toFixed(0)} yaw:${r.pose.yaw.toFixed(0)}` : '';
  const seen = r.boxes.map((b) => `${b.label}:${b.score.toFixed(2)}`).join(' ') || 'nothing';
  return `${seen} | gaze:${gaze}${pose} | ${r.ms}ms`;
}
