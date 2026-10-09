import { fmtClock, fmtDuration } from '../lib/format.js';
import { STATES } from '../lib/states.js';
import Card from './Card.jsx';

const BUCKET_MS = 15 * 60_000;

// Ambient Mode: rolling 15-minute buckets. Groups are named in text; the bar
// reuses the attention-state colors (on-task / drift / away) so no new
// palette is needed and nothing relies on color alone.
export default function AmbientBuckets({ sessions }) {
  const buckets = sessions
    .filter((s) => s.mode === 'ambient')
    .flatMap((s) => s.buckets)
    .sort((a, b) => a.t - b.t);
  if (!buckets.length) return null;

  return (
    <Card title="Ambient activity" subtitle="Rolling 15-minute buckets from Ambient Mode · drift logged, never shown">
      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
        {buckets.map((b) => {
          const away = b.groups.find((g) => g.key === 'away')?.ms ?? 0;
          const onTask = Math.max(0, b.activeMs - b.driftMs);
          const seg = (ms, state) =>
            ms > 0 && (
              <span
                className="h-full first:rounded-l-sm last:rounded-r-sm"
                style={{ width: `${(ms / BUCKET_MS) * 100}%`, backgroundColor: STATES[state].color }}
              />
            );
          const breakdown = b.groups
            .filter((g) => g.key !== 'away')
            .slice(0, 3)
            .map((g) => `${g.label} ${fmtDuration(g.ms)}`)
            .join(' · ');
          return (
            <li key={b.t} className="grid grid-cols-[96px_170px_1fr_88px] items-center gap-4 px-4 py-2 text-[12px]">
              <span className="font-mono text-zinc-500 tabular-nums">
                {fmtClock(b.t)}–{fmtClock(b.end)}
              </span>
              <span className="truncate text-zinc-200">{b.topLabel}</span>
              <div className="min-w-0">
                <div
                  className="flex h-2 gap-[2px] rounded-sm bg-white/[0.04]"
                  title={`On-task ${fmtDuration(onTask)} · Drift ${fmtDuration(b.driftMs)} · Away ${fmtDuration(away)}`}
                >
                  {seg(onTask, 'focus')}
                  {seg(b.driftMs, 'drift')}
                  {seg(away, 'idle')}
                </div>
                <div className="mt-1 truncate text-[11px] text-zinc-500">{breakdown}</div>
              </div>
              <span className={`text-right font-mono tabular-nums ${b.driftMs ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {b.driftMs ? `${fmtDuration(b.driftMs)} drift` : 'no drift'}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
