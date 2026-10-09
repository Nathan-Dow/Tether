import { useCallback, useEffect, useRef, useState } from 'react';
import { bridge } from '../lib/bridge.js';

// Push-to-talk / tap-to-talk recorder for voice goals. Audio stays in memory
// and goes straight to the main process (Whisper + the local model).
//
// phase: 'off' | 'listening' | 'thinking' | 'error'
const TARGET_RATE = 16_000; // Whisper's input rate
const SILENCE_MS = 1500; // a pause this long after speaking ends the take
const NO_SPEECH_MS = 6000; // give up if nothing is said
const MAX_MS = 15_000;
const MIN_SPEECH_MS = 300;
const HOLD_MS = 350; // pointer held longer than this = push-to-talk
const BARS = 32;
const VOICED_RUN = 3; // consecutive loud chunks (~130 ms) before it counts as speech

// Average-downsample to 16 kHz (mic is usually 48 kHz).
function downsample(chunks, fromRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

export function useVoice({ onResult }) {
  const [phase, setPhase] = useState('off');
  const [error, setError] = useState(null);
  const [levels, setLevels] = useState(() => Array(BARS).fill(0));
  const rec = useRef(null);
  const request = useRef(0); // ignore results that arrive after a cancel
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const release = useCallback(() => {
    const r = rec.current;
    if (!r) return null;
    rec.current = null;
    clearTimeout(r.maxTimer);
    r.proc.onaudioprocess = null;
    r.proc.disconnect();
    r.src.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close().catch(() => {});
    setLevels(Array(BARS).fill(0));
    return r;
  }, []);

  const fail = useCallback((code) => {
    setError(code);
    setPhase('error');
  }, []);

  const stop = useCallback(async () => {
    const r = release();
    if (!r) return;
    if (r.speechMs < MIN_SPEECH_MS) return fail('no-speech');
    const id = ++request.current;
    setPhase('thinking');
    const res = await bridge
      .transcribe(downsample(r.chunks, r.ctx.sampleRate))
      .catch(() => ({ ok: false, error: 'failed' }));
    if (id !== request.current) return;
    if (!res?.ok) return fail(res?.error ?? 'failed');
    setPhase('off');
    onResultRef.current?.(res);
  }, [release, fail]);

  const cancel = useCallback(() => {
    request.current++;
    release();
    setError(null);
    setPhase('off');
  }, [release]);

  const start = useCallback(
    async ({ hold = false } = {}) => {
      if (rec.current) return;
      request.current++;
      setError(null);
      setPhase('listening');
      const id = request.current;
      const pressedAt = performance.now();

      // Push-to-talk: a long press records until release; a quick tap
      // switches to hands-free (pause to finish). Listen right away - the
      // release can come before the microphone is open.
      const press = { hold, releasedAt: null };
      if (hold) {
        window.addEventListener(
          'pointerup',
          () => {
            press.releasedAt = performance.now();
            const r = rec.current;
            if (!r || r.id !== id) return;
            if (press.releasedAt - pressedAt >= HOLD_MS) stop();
            else r.hold = false;
          },
          { once: true },
        );
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err) {
        if (id === request.current) fail(err?.name === 'NotAllowedError' ? 'denied' : 'no-mic');
        return;
      }
      if (id !== request.current) {
        stream.getTracks().forEach((t) => t.stop()); // cancelled while asking
        return;
      }

      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      const startedAt = performance.now();
      const r = { id, stream, ctx, src, proc, chunks: [], speechMs: 0, lastVoiceAt: 0, noise: 0.005, run: 0, startedAt };
      // Released while the mic was opening: a tap means hands-free.
      r.hold = hold && press.releasedAt == null;
      rec.current = r;

      proc.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        r.chunks.push(data);
        let sq = 0;
        for (let i = 0; i < data.length; i++) sq += data[i] * data[i];
        const rms = Math.sqrt(sq / data.length);
        // Speech = sustained energy well above the learned background
        // level; short clicks and taps don't count.
        const now = performance.now();
        const chunkMs = (data.length / ctx.sampleRate) * 1000;
        const loud = rms > Math.max(0.015, r.noise * 3);
        r.run = loud ? r.run + 1 : 0;
        if (!loud) r.noise = r.noise * 0.95 + rms * 0.05;
        if (r.run >= VOICED_RUN) {
          r.speechMs += r.run === VOICED_RUN ? chunkMs * VOICED_RUN : chunkMs;
          r.lastVoiceAt = now;
        }
        setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 9)]);

        if (r.hold) return; // push-to-talk: the release ends it
        if (r.speechMs >= MIN_SPEECH_MS && now - r.lastVoiceAt > SILENCE_MS) stop();
        else if (r.speechMs === 0 && now - startedAt > NO_SPEECH_MS) stop();
      };
      src.connect(proc);
      proc.connect(ctx.destination); // outputs silence; needed for the node to run
      r.maxTimer = setTimeout(stop, MAX_MS);
    },
    [fail, stop],
  );

  const toggle = useCallback(() => {
    if (rec.current) stop();
    else if (phase !== 'thinking') start();
  }, [phase, start, stop]);

  useEffect(() => () => release(), [release]);

  return { phase, error, levels, start, stop, cancel, toggle };
}
