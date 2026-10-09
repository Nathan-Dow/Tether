import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtClockSeconds, fmtDuration } from '../lib/format.js';
import { stateOf } from '../lib/states.js';
import Card from './Card.jsx';

const FILTERS = [
  ['all', 'All'],
  ['drift', 'Drift'],
  ['debug', 'Debugging'],
  ['focus', 'Focus'],
];

const SOURCE = {
  model: 'Local model',
  cache: 'Local model',
  rules: 'Rules',
  allowlist: 'You: related',
};

function Verdict({ v, state }) {
  if (!v || state === 'idle') return <span className="text-zinc-600">–</span>;
  const pct = v.confidence != null ? ` · ${Math.round(v.confidence * 100)}%` : '';
  return (
    <span className="text-zinc-400" title={v.reason || undefined}>
      {SOURCE[v.source] ?? v.source}
      <span className="text-zinc-600">{pct}</span>
    </span>
  );
}

// Drill-down log: every focus segment with its window title and the
// evaluation that labelled it.
export default function ActivityStream({ sessions, selectedT, className = '' }) {
  const [filter, setFilter] = useState('all');
  const rowRefs = useRef(new Map());
  const scrollRef = useRef(null);

  const rows = useMemo(
    () =>
      sessions
        .flatMap((s) => s.stream.map((r) => ({ ...r, goal: s.goal, id: `${s.id}-${r.start}` })))
        .sort((a, b) => a.start - b.start),
    [sessions],
  );
  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) c[r.state] = (c[r.state] || 0) + 1;
    return c;
  }, [rows]);
  const visible = filter === 'all' ? rows : rows.filter((r) => r.state === filter);

  // Scrubbing the timeline selects the row covering most of that minute.
  const selectedId = useMemo(() => {
    if (selectedT == null) return null;
    let best = null;
    let bestMs = 0;
    for (const r of rows) {
      const ms = Math.min(r.end, selectedT + 60_000) - Math.max(r.start, selectedT);
      if (ms > bestMs) {
        best = r.id;
        bestMs = ms;
      }
    }
    return best;
  }, [rows, selectedT]);

  useEffect(() => {
    if (!selectedId) return;
    if (filter !== 'all' && !visible.some((r) => r.id === selectedId)) setFilter('all');
    // Scroll only the table (scrollIntoView would also move the page and
    // push the timeline you're scrubbing out of view).
    const row = rowRefs.current.get(selectedId);
    const box = scrollRef.current;
    if (!row || !box) return;
    const offset = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({
      top: box.scrollTop + offset - box.clientHeight / 2 + row.offsetHeight / 2,
      behavior: 'smooth',
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card
      className={className}
      title="Activity stream"
      subtitle="Window titles, timestamps and the evaluation behind each label"
      right={
        <div className="flex rounded-lg border border-white/[0.08] p-0.5">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`h-6 rounded-md px-2 text-[11.5px] transition-colors ${
                filter === key ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
              <span className="ml-1 font-mono text-[10.5px] text-zinc-600">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
      }
    >
      <div ref={scrollRef} className="max-h-[520px] overflow-y-auto border-t border-white/[0.06]">
        <table className="w-full table-fixed text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#0c0c0e] text-[10.5px] tracking-wider text-zinc-500 uppercase">
            <tr className="border-b border-white/[0.06]">
              <th className="w-[88px] py-2 pl-4 font-normal">Time</th>
              <th className="w-[58px] py-2 font-normal">Dur</th>
              <th className="w-[96px] py-2 font-normal">State</th>
              <th className="py-2 font-normal">Window</th>
              <th className="w-[132px] py-2 pr-4 font-normal">Evaluation</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {visible.map((r) => {
              const st = stateOf(r.state);
              const selected = r.id === selectedId;
              return (
                <tr
                  key={r.id}
                  ref={(el) => (el ? rowRefs.current.set(r.id, el) : rowRefs.current.delete(r.id))}
                  className={`border-b border-white/[0.04] ${selected ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}
                >
                  <td className="py-1.5 pl-4 text-zinc-500 tabular-nums">{fmtClockSeconds(r.start)}</td>
                  <td className="py-1.5 text-zinc-400 tabular-nums">{fmtDuration(r.end - r.start)}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5 font-sans text-zinc-300">
                      <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: st.color }} />
                      {st.label}
                    </span>
                  </td>
                  <td className="truncate py-1.5 pr-3 font-sans" title={r.title || r.label}>
                    <span className="text-zinc-200">{r.site}</span>
                    {r.title && r.title !== r.site && <span className="ml-2 text-zinc-600">{r.title}</span>}
                  </td>
                  <td className="truncate py-1.5 pr-4 font-sans">
                    <Verdict v={r.verdict} state={r.state} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <p className="px-4 py-6 text-[12px] text-zinc-600">Nothing in this filter.</p>}
      </div>
    </Card>
  );
}
