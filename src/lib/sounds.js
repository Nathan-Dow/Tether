// Audio cues, synthesized with Web Audio (no sound files to ship):
//   goalSet - a bright rising two-note chime when a sprint starts
//   drift   - a soft, low falling two-note tone when you drift
// Quiet on purpose: a nudge, not an alarm.
let ctx = null;

function audio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One soft note: quick attack, exponential decay, with a quiet octave on top.
function note(ac, { freq, at, dur, type = 'sine', gain = 0.12 }) {
  const t = ac.currentTime + at;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(ac.destination);

  for (const [mult, level] of [
    [1, 1],
    [2, 0.18],
  ]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, t);
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

export function playGoalSet() {
  const ac = audio();
  if (!ac) return;
  note(ac, { freq: 659.25, at: 0, dur: 0.22 }); // E5
  note(ac, { freq: 987.77, at: 0.09, dur: 0.42 }); // B5
}

export function playDrift() {
  const ac = audio();
  if (!ac) return;
  note(ac, { freq: 440, at: 0, dur: 0.26, type: 'triangle', gain: 0.14 }); // A4
  note(ac, { freq: 349.23, at: 0.16, dur: 0.48, type: 'triangle', gain: 0.14 }); // F4
}
