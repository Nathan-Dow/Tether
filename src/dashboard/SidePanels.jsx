import { Bug, BookOpen, CalendarPlus, Download, MessageCircle } from 'lucide-react';
import { bridge } from '../lib/bridge.js';
import { fmtClock, fmtDuration } from '../lib/format.js';
import { STATES } from '../lib/states.js';
import ExportButton from '../components/ExportButton.jsx';
import Ribbon from '../components/Ribbon.jsx';
import Card from './Card.jsx';

// Cognitive Leak Leaderboard: where unaligned attention went.
export function Leaderboard({ items }) {
  const max = Math.max(1, ...items.map((i) => i.ms));
  return (
    <Card title="Cognitive leak leaderboard" subtitle="Apps and sites holding off-task attention">
      <ol className="space-y-2.5 px-4 pb-4">
        {items.map((it, i) => (
          <li key={it.site} title={`${it.site}: ${fmtDuration(it.ms)} (${Math.round(it.share * 100)}% of drift)`}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 font-mono text-[11px] text-zinc-600">{i + 1}</span>
                <span className="truncate text-zinc-200">{it.site}</span>
              </span>
              <span className="shrink-0 font-mono text-zinc-400 tabular-nums">
                {fmtDuration(it.ms)}
                <span className="ml-1.5 text-zinc-600">{Math.round(it.share * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 ml-6 h-1.5 rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(it.ms / max) * 100}%`, backgroundColor: STATES.drift.color }}
              />
            </div>
          </li>
        ))}
        {!items.length && <li className="text-[12px] text-zinc-600">No off-task attention recorded.</li>}
      </ol>
    </Card>
  );
}

const KINDS = {
  social: { Icon: MessageCircle, label: 'Social leak' },
  informational: { Icon: BookOpen, label: 'Informational rabbit hole' },
  debugging: { Icon: Bug, label: 'Debugger loop' },
};

// Friction Debt: each rabbit hole, how deep it went and whether you came back.
export function Episodes({ episodes }) {
  const top = [...episodes].sort((a, b) => b.durationMs - a.durationMs).slice(0, 6);
  return (
    <Card title="Friction debt" subtitle="Rabbit holes by depth before returning to the goal">
      <ul className="space-y-1 px-2 pb-3">
        {top.map((e) => {
          const k = KINDS[e.kind] ?? KINDS.social;
          return (
            <li key={`${e.sessionId}-${e.start}`} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
              <k.Icon size={14} className="mt-0.5 shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="truncate text-zinc-200">{k.label}</span>
                  <span className="shrink-0 font-mono text-zinc-300 tabular-nums">{fmtDuration(e.durationMs)}</span>
                </div>
                <div className="truncate text-[11px] text-zinc-500">
                  {e.sites.slice(0, 3).join(', ')} · {fmtClock(e.start)}
                  {e.returnedToGoal ? ' · returned' : ' · did not return'}
                </div>
              </div>
            </li>
          );
        })}
        {!top.length && <li className="px-2 text-[12px] text-zinc-600">No rabbit holes today.</li>}
      </ul>
    </Card>
  );
}

// Today's sprints; clicking one scrubs the timeline to its start. Each can
// be exported to Google Calendar or as an .ics file.
export function SessionList({ sessions, onSelect }) {
  return (
    <Card title="Sprints" subtitle="Flow score and fragmentation index per sprint">
      <ul className="space-y-1 px-2 pb-3">
        {[...sessions]
          .sort((a, b) => b.startedAt - a.startedAt)
          .map((s) => (
            <li key={s.id} className="rounded-lg transition-colors hover:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => onSelect(s.timeline[0]?.t ?? s.startedAt)}
                className="w-full rounded-lg px-2 pt-2 pb-1.5 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] text-zinc-200">{s.goal}</span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                    {fmtClock(s.startedAt)}
                  </span>
                </div>
                <div className="mt-1 flex gap-3 font-mono text-[11px] text-zinc-500">
                  <span>
                    Flow <span className="text-zinc-300">{s.flowScore ?? '–'}</span>
                  </span>
                  <span>
                    CFI <span className="text-zinc-300">{s.cfi ?? '–'}</span>
                  </span>
                  <span>
                    Deep <span className="text-zinc-300">{fmtDuration(s.deepWorkMs)}</span>
                  </span>
                </div>
                <Ribbon timeline={s.timeline} className="mt-2 h-1.5" />
              </button>
              <div className="flex gap-1.5 px-2 pb-2">
                <ExportButton
                  small
                  icon={CalendarPlus}
                  label="Google Calendar"
                  doneLabel="Opened"
                  title="Open a pre-filled Google Calendar event in your browser"
                  run={() => bridge.openGoogleCalendar(s.id)}
                />
                <ExportButton
                  small
                  icon={Download}
                  label=".ics"
                  doneLabel="Saved"
                  title="Save a calendar file (Google, Outlook, Apple Calendar)"
                  run={() => bridge.saveIcs(s.id)}
                />
              </div>
            </li>
          ))}
      </ul>
    </Card>
  );
}
