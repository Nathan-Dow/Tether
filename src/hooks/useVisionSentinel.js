import { useCallback, useEffect, useState } from 'react';

// Vision Sentinel: while a sprint runs, sample one 320x240 webcam frame every
// SAMPLE_MS and run an on-device object detector (MediaPipe EfficientDet-Lite0,
// COCO classes) for "person" (present at the desk) and "cell phone" (the
// classic site-blocker bypass). Frames never leave the renderer.
//
// status: 'off' | 'starting' | 'locked' | 'away' | 'unavailable'
const SAMPLE_MS = 7000;
const FIRST_SAMPLE_MS = 1500;
const PERSON_MIN = 0.5;
const PHONE_MIN = 0.4;
const W = 320;
const H = 240;

const asset = (p) => new URL(p, document.baseURI).href;

let detectorPromise = null;
function loadDetector() {
  detectorPromise ??= import('@mediapipe/tasks-vision').then(async ({ FilesetResolver, ObjectDetector }) => {
    const fileset = await FilesetResolver.forVisionTasks(asset('vision/wasm'));
    return ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('vision/efficientdet_lite0.tflite'), delegate: 'CPU' },
      runningMode: 'IMAGE',
      scoreThreshold: 0.3,
      maxResults: 5,
      categoryAllowlist: ['person', 'cell phone'],
    });
  });
  detectorPromise.catch(() => {
    detectorPromise = null; // let the next sprint retry
  });
  return detectorPromise;
}

function best(result, name) {
  let score = 0;
  for (const d of result?.detections ?? []) {
    for (const c of d.categories) if (c.categoryName === name) score = Math.max(score, c.score);
  }
  return score;
}

export function useVisionSentinel({ active }) {
  const [status, setStatus] = useState('off');
  const [cameraPhone, setCameraPhone] = useState(false);
  const [demoPhone, setDemoPhone] = useState(false);
  const [last, setLast] = useState(null); // { person, phone, at } scores for debugging

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream = null;
    let timer = null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    setStatus('starting');
    (async () => {
      try {
        const [detector, s] = await Promise.all([
          loadDetector(),
          navigator.mediaDevices.getUserMedia({ video: { width: W, height: H, frameRate: 5 }, audio: false }),
        ]);
        stream = s;
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();

        const sample = () => {
          if (cancelled || video.readyState < 2) return;
          ctx.drawImage(video, 0, 0, W, H);
          const result = detector.detect(canvas);
          const person = best(result, 'person');
          const phone = best(result, 'cell phone');
          setLast({ person, phone, at: Date.now() });
          setStatus(person >= PERSON_MIN ? 'locked' : 'away');
          setCameraPhone(phone >= PHONE_MIN);
        };
        timer = setTimeout(function tick() {
          try {
            sample();
          } catch (err) {
            console.warn('[vision] sample failed:', err.message);
          }
          if (!cancelled) timer = setTimeout(tick, SAMPLE_MS);
        }, FIRST_SAMPLE_MS);
      } catch (err) {
        console.warn('[vision] unavailable:', err.message);
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      setStatus('off');
      setCameraPhone(false);
    };
  }, [active]);

  // Ctrl+Shift+W demo failsafe: works with no camera, bad light, or no sprint.
  const toggleDemo = useCallback(() => setDemoPhone((on) => !on), []);
  const clearDemo = useCallback(() => setDemoPhone(false), []);

  return {
    status,
    last,
    demo: demoPhone,
    phoneDetected: demoPhone || cameraPhone,
    source: demoPhone ? 'demo' : 'camera',
    toggleDemo,
    clearDemo,
  };
}
