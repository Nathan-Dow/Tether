// Shared display formatting for durations and times.

// 95_000 -> "2m", 3_900_000 -> "1h 05m", 20_000 -> "<1m"
export function fmtDuration(ms) {
  if (ms == null) return '–';
  const totalMin = Math.round(ms / 60_000);
  if (ms > 0 && totalMin === 0) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// 24-hour so it stays one compact, aligned column in tables.
export function fmtClockSeconds(ms) {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}
