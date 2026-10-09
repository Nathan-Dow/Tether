import { useEffect, useState } from 'react';

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Returns { label, remainingMs, done, progress } for the active sprint. In
// Ambient Mode there's no timer, so the label counts up instead.
export function useCountdown(sprint) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sprint) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [sprint]);

  if (!sprint) return { label: '--:--', remainingMs: 0, done: false, progress: 0 };
  if (!sprint.durationMin) {
    return { label: format(Math.max(0, now - sprint.startedAt)), remainingMs: Infinity, done: false, progress: 0 };
  }

  const durationMs = sprint.durationMin * 60_000;
  const remainingMs = Math.max(0, sprint.startedAt + durationMs - now);
  return {
    label: format(remainingMs),
    remainingMs,
    done: remainingMs === 0,
    progress: 1 - remainingMs / durationMs,
  };
}
