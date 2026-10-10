import { useCallback, useEffect, useState } from 'react';
import { analyze, describe, GazeTracker, H, loadVision, PERSON_MIN, PHONE_MIN, W } from '../lib/vision.js';

// Vision Sentinel: while a sprint runs, sample one 320x240 webcam frame every
// SAMPLE_MS and check, on-device, that you're at the desk, whether a phone is
// in frame, and where your head is pointed. Frames never leave the renderer.
//
// status: 'off' | 'starting' | 'locked' | 'away' | 'down' | 'side' | 'noface' | 'unavailable'
// cause (when physical drift is on): 'phone' | 'head-down'
const SAMPLE_MS = 7000;
const FIRST_SAMPLE_MS = 1500;
const DOWN_SAMPLES = 2; // head down this many samples in a row (~14 s) = phone in lap?

export function useVisionSentinel({ active }) {
  const [status, setStatus] = useState('off');
  const [cameraCause, setCameraCause] = useState(null);
  const [demoPhone, setDemoPhone] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream = null;
    let timer = null;
    let downStreak = 0;
    const gaze = new GazeTracker();
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
        const [models, s] = await Promise.all([
          loadVision(),
          navigator.mediaDevices.getUserMedia({ video: { width: W, height: H, frameRate: 5 }, audio: false }),
        ]);
        stream = s;
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();

        const sample = () => {
          if (cancelled) return;
          if (video.readyState < 2) return console.warn('[vision] camera has no frame yet');
          ctx.drawImage(video, 0, 0, W, H);
          const r = analyze(models, canvas);
          const g = r.person >= PERSON_MIN || r.pose ? gaze.update(r.pose) : 'away';
          console.warn('[vision]', describe(r, g));

          downStreak = g === 'down' ? downStreak + 1 : 0;
          setStatus(g === 'screen' ? 'locked' : g);
          setCameraCause(r.phone >= PHONE_MIN ? 'phone' : downStreak >= DOWN_SAMPLES ? 'head-down' : null);
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
      setCameraCause(null);
    };
  }, [active]);

  // Ctrl+Shift+W demo failsafe: works with no camera, bad light, or no sprint.
  const toggleDemo = useCallback(() => setDemoPhone((on) => !on), []);
  const clearDemo = useCallback(() => setDemoPhone(false), []);

  const cause = demoPhone ? 'phone' : cameraCause;
  return {
    status,
    demo: demoPhone,
    phoneDetected: Boolean(cause), // physical drift of either kind
    cause,
    source: demoPhone ? 'demo' : 'camera',
    toggleDemo,
    clearDemo,
  };
}
