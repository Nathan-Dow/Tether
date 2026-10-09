import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  FlaskConical,
  Minus,
  Radio,
  Trash2,
  Zap,
} from 'lucide-react';
import { bridge, modKey } from '../lib/bridge.js';
import { fmtDuration } from '../lib/format.js';
import DayRibbon from './DayRibbon.jsx';
import ActivityStream from './ActivityStream.jsx';
import AmbientBuckets from './AmbientBuckets.jsx';
import { Episodes, Leaderboard, SessionList } from './SidePanels.jsx';

function TopBar({ demo, setDemo, onClear, day }) {
  const tab = (active, onClick, Icon, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors ${
        active ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );

  return (
    <div className="titlebar flex h-11 shrink-0 items-center gap-4 border-b border-white/[0.08] pr-[150px] pl-4">
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-white/[0.06]">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
        </span>
        <span className="text-[13px] font-semibold text-zinc-100">Tether</span>
        <span className="text-[13px] text-zinc-600">/</span>
        <span className="text-[13px] text-zinc-400">Focus dashboard</span>
      </div>
      <span className="font-mono text-[11.5px] text-zinc-600">{day}</span>

      <div className="ml-auto flex items-center gap-3">
        {demo && (
          <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-amber-300 uppercase">
            Demo data
          </span>
        )}
        <div role="tablist" className="flex rounded-lg border border-white/[0.08] p-0.5">
          {tab(!demo, () => setDemo(false), Radio, 'Live')}
          {tab(demo, () => setDemo(true), FlaskConical, 'Demo day')}
        </div>
        {!demo && (
          <button
            type="button"
            onClick={onClear}
            title="Delete all recorded sprints from this computer"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-300"
          >
            <Trash2 size={13} />
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, foot }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] px-4 py-3.5">
      <div className="text-[11.5px] text-zinc-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-[30px] leading-none font-semibold text-zinc-50 tabular-nums">
          {value}
        </span>
        {unit && <span className="font-mono text-[13px] text-zinc-500">{unit}</span>}
      </div>
      <div className="mt-2.5 flex min-h-5 items-center gap-1.5 text-[11.5px] text-zinc-400">{foot}</div>
    </div>
  );
}

const VELOCITY = {
  steady: { Icon: Check, color: 'text-emerald-400', label: 'Steady' },
  scattered: { Icon: Activity, color: 'text-amber-400', label: 'Scattered' },
  thrashing: { Icon: Zap, color: 'text-red-400', label: 'Thrashing' },
};

const EPISODE_SHORT = { social: 'Social', informational: 'Info', debugging: 'Debug' };

function KpiRow({ kpis, episodes }) {
  const trend = kpis.flowTrend;
  const TrendIcon = trend == null ? Minus : trend >= 0 ? ArrowUpRight : ArrowDownRight;
  const v = VELOCITY[kpis.velocity];

  const debtByKind = {};
  for (const e of episodes) debtByKind[e.kind] = (debtByKind[e.kind] || 0) + e.durationMs;

  return (
    <div className="grid grid-cols-4 gap-3">
      <Kpi
        label="Today's flow score"
        value={kpis.flowScore ?? '–'}
        unit="/100"
        foot={
          <>
            <TrendIcon
              size={14}
              className={trend == null ? 'text-zinc-600' : trend >= 0 ? 'text-emerald-400' : 'text-amber-400'}
            />
            {trend == null
              ? 'No earlier sprints to compare'
              : `${trend >= 0 ? '+' : ''}${trend} vs previous sprints (${kpis.previousAvg})`}
          </>
        }
      />
      <Kpi
        label="Context switching velocity"
        value={kpis.switchesPerHour ?? '–'}
        unit="/h"
        foot={
          v && (
            <>
              <v.Icon size={14} className={v.color} />
              {v.label}
              <span className="text-zinc-600">· under 20/h is steady</span>
            </>
          )
        }
      />
      <Kpi
        label="Verified deep work"
        value={fmtDuration(kpis.deepWorkMs)}
        foot={`of ${fmtDuration(kpis.totals.onTaskMs)} on-task · stretches ≥ 5 min`}
      />
      <Kpi
        label="Friction debt accrued"
        value={fmtDuration(kpis.frictionDebtMs)}
        foot={
          Object.keys(debtByKind).length
            ? Object.entries(debtByKind)
                .sort((a, b) => b[1] - a[1])
                .map(([k, ms]) => `${EPISODE_SHORT[k]} ${fmtDuration(ms)}`)
                .join(' · ')
            : 'No rabbit holes today'
        }
      />
    </div>
  );
}

function EmptyState({ onDemo }) {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-white/[0.08]">
        <span className="size-2 rounded-full bg-zinc-600" />
      </div>
      <h2 className="mt-4 text-[15px] font-medium text-zinc-100">No sprints recorded today</h2>
      <p className="mt-1.5 text-[13px] text-zinc-500">
        Press <kbd className="rounded border border-white/10 px-1 font-sans text-[11px]">{modKey} Shift K</kbd>{' '}
        to declare a sprint from the island. Everything here is computed on this machine.
      </p>
      <button
        type="button"
        onClick={onDemo}
        className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/5"
      >
        <FlaskConical size={13} />
        Load demo day
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [demo, setDemo] = useState(false);
  const [report, setReport] = useState(null);
  const [selectedT, setSelectedT] = useState(null);
  const [labels, setLabels] = useState({});

  const load = useCallback(() => {
    bridge.getDayReport({ demo }).then((r) => r && setReport(r));
  }, [demo]);

  // Your labels re-score every sprint, so reload the report when they change.
  useEffect(() => {
    bridge.getLabels().then((l) => l && setLabels(l));
    return bridge.onLabelsChanged((l) => {
      setLabels(l);
      load();
    });
  }, [load]);

  // Live mode refreshes while a sprint is running and when one finishes.
  useEffect(() => {
    setSelectedT(null);
    load();
    if (demo) return undefined;
    const id = setInterval(load, 10_000);
    const off = bridge.onSessionFinished(load);
    return () => {
      clearInterval(id);
      off();
    };
  }, [demo, load]);

  const clear = async () => {
    if (await bridge.clearHistory()) load();
  };

  const day = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const hasData = report?.sessions.length > 0;

  return (
    <div className="flex h-full flex-col">
      <TopBar demo={demo} setDemo={setDemo} onClear={clear} day={day} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-4 px-6 pt-5 pb-10">
          {!report ? null : !hasData ? (
            <EmptyState onDemo={() => setDemo(true)} />
          ) : (
            <>
              <KpiRow kpis={report.kpis} episodes={report.episodes} />
              <DayRibbon sessions={report.sessions} selectedT={selectedT} onSelect={setSelectedT} />
              <AmbientBuckets sessions={report.sessions} />
              <div className="grid grid-cols-3 items-start gap-4">
                <ActivityStream
                  className="col-span-2"
                  sessions={report.sessions}
                  selectedT={selectedT}
                  labels={labels}
                  onLabel={(site, label) => bridge.setLabel(site, label)}
                />
                <div className="space-y-4">
                  <Leaderboard items={report.leaderboard} />
                  <Episodes episodes={report.episodes} />
                  <SessionList sessions={report.sessions} onSelect={setSelectedT} />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
