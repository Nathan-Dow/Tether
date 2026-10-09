import { useRef, useState } from 'react';
import { fmtClock, fmtDuration } from '../lib/format.js';
import { STATES, stateOf } from '../lib/states.js';
import Card from './Card.jsx';

const MIN = 60_000;
const MAX_GAP_MIN = 18; // long breaks between sprints are drawn compressed

const LEGEND = ['focus', 'drift', 'debug', 'idle'];

function Legend() {
  return (
    <div className="flex items-center gap-3">
      {LEGEND.map((k) => (
        <span key={k} className="flex items-center gap-1.5 text-[11.5px] text-zinc-400">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: STATES[k].color }} />
          {STATES[k].label}
        </span>
      ))}
    </div>
  );
}

// Attention Residue Timeline: every minute of today's sprints in one ribbon.
// Hover for detail; press and drag to scrub the activity stream.
export default function DayRibbon({ sessions, selectedT, onSelect }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { b, session, x }
  const [scrubbing, setScrubbing] = useState(false);

  const ordered = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const items = [];
  ordered.forEach((s, i) => {
    if (i > 0) {
      const gapMs = s.startedAt - ordered[i - 1].endedAt;
      if (gapMs > MIN) items.push({ gap: true, ms: gapMs, key: `gap-${s.id}` });
    }
    items.push({ session: s, key: s.id });
  });

  const enter = (e, b, session) => {
    const wrap = wrapRef.current.getBoundingClientRect();
    const cell = e.currentTarget.getBoundingClientRect();
    setHover({ b, session, x: cell.left + cell.width / 2 - wrap.left, width: wrap.width });
    if (scrubbing) onSelect(b.t);
  };

  return (
    <Card
      title="Attention residue timeline"
      subtitle="Every minute of today's sprints · hover for detail, drag to scrub the activity stream"
      right={<Legend />}
    >
      <div className="px-4 pb-4">
        <div
          ref={wrapRef}
          className="relative select-none"
          onMouseLeave={() => {
            setHover(null);
            setScrubbing(false);
          }}
          onMouseUp={() => setScrubbing(false)}
        >
          {hover && (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 shadow-xl"
              style={{ left: Math.min(Math.max(hover.x, 112), hover.width - 112) }}
            >
              <div className="flex items-center justify-between font-mono text-[11px] text-zinc-400">
                <span>{fmtClock(hover.b.t)}</span>
                <span className="flex items-center gap-1.5 font-sans text-zinc-200">
                  <span className="size-2 rounded-sm" style={{ backgroundColor: stateOf(hover.b.state).color }} />
                  {stateOf(hover.b.state).label}
                </span>
              </div>
              {hover.b.top && <div className="mt-1 truncate text-[12.5px] text-zinc-100">{hover.b.top}</div>}
              <div className="mt-0.5 truncate text-[11px] text-zinc-500">{hover.session.goal}</div>
            </div>
          )}

          <div className="flex h-10 items-stretch gap-1">
            {items.map((it) =>
              it.gap ? (
                <div
                  key={it.key}
                  className="flex items-center justify-center border-y border-dashed border-white/[0.08]"
                  style={{ flexGrow: Math.min(it.ms / MIN, MAX_GAP_MIN), flexBasis: 0 }}
                  title={`Break · ${fmtDuration(it.ms)}`}
                >
                  <span className="truncate px-1 font-mono text-[10px] text-zinc-600">{fmtDuration(it.ms)}</span>
                </div>
              ) : (
                <div
                  key={it.key}
                  className="flex gap-px overflow-hidden rounded-md"
                  style={{ flexGrow: it.session.timeline.length, flexBasis: 0 }}
                >
                  {it.session.timeline.map((b) => {
                    const selected = selectedT === b.t;
                    return (
                      <div
                        key={b.t}
                        className="min-w-px flex-1 cursor-crosshair transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: stateOf(b.state).color,
                          boxShadow: selected ? 'inset 0 0 0 2px #fafafa' : undefined,
                        }}
                        onMouseEnter={(e) => enter(e, b, it.session)}
                        onMouseDown={() => {
                          setScrubbing(true);
                          onSelect(b.t);
                        }}
                      />
                    );
                  })}
                </div>
              ),
            )}
          </div>

          {/* Axis: each sprint's start time and goal under its block. */}
          <div className="mt-2 flex gap-1">
            {items.map((it) =>
              it.gap ? (
                <div key={it.key} style={{ flexGrow: Math.min(it.ms / MIN, MAX_GAP_MIN), flexBasis: 0 }} />
              ) : (
                <div
                  key={it.key}
                  className="min-w-0"
                  style={{ flexGrow: it.session.timeline.length, flexBasis: 0 }}
                >
                  <div
                    className="truncate font-mono text-[10.5px] text-zinc-500"
                    title={`${fmtClock(it.session.startedAt)}–${fmtClock(it.session.endedAt)} · ${it.session.goal}`}
                  >
                    {fmtClock(it.session.startedAt)}–{fmtClock(it.session.endedAt)}
                  </div>
                  <div className="truncate text-[11px] text-zinc-400" title={it.session.goal}>
                    {it.session.goal}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
