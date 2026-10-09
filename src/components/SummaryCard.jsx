import { useState } from 'react';
import { CalendarPlus, Check, CircleCheck, Download, X } from 'lucide-react';
import { bridge } from '../lib/bridge.js';
import { fmtDuration } from '../lib/format.js';
import Ribbon from './Ribbon.jsx';

function Stat({ value, label, tone = 'text-zinc-50' }) {
  return (
    <div className="min-w-0">
      <div className={`font-mono text-[17px] leading-none font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] tracking-[0.08em] text-zinc-500 uppercase">{label}</div>
    </div>
  );
}

// Button that runs an async export and briefly confirms the result.
function ExportButton({ icon: Icon, label, doneLabel, run }) {
  const [status, setStatus] = useState('idle'); // idle | busy | done
  const click = async () => {
    if (status === 'busy') return;
    setStatus('busy');
    const res = await run().catch(() => ({ ok: false }));
    setStatus(res?.ok ? 'done' : 'idle');
    if (res?.ok) setTimeout(() => setStatus('idle'), 2000);
  };
  const done = status === 'done';
  return (
    <button
      type="button"
      onClick={click}
      disabled={status === 'busy'}
      className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
        done
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
          : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-zinc-50'
      }`}
    >
      {done ? <Check size={13} /> : <Icon size={13} />}
      {done ? doneLabel : label}
    </button>
  );
}

export default function SummaryCard({ report, onClose }) {
  const t = report.totals;
  const actualMs = report.endedAt - report.startedAt;

  return (
    <div className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-emerald-300 uppercase">
            <CircleCheck size={14} />
            Sprint complete
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {fmtDuration(actualMs)}
              {report.plannedMin ? ` / ${report.plannedMin}m` : ''}
            </span>
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="flex size-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="mt-1.5 truncate text-[14px] font-medium text-zinc-100">{report.goal}</div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat value={fmtDuration(report.deepWorkMs)} label="Deep flow" tone="text-emerald-300" />
        <Stat value={fmtDuration(t.driftMs)} label="Drift" tone="text-amber-300" />
        <Stat value={report.flowScore ?? '–'} label="Flow score" />
        <Stat value={report.cfi ?? '–'} label="CFI" />
      </div>

      <Ribbon timeline={report.timeline} />

      <div className="flex items-center gap-2">
        <ExportButton
          icon={CalendarPlus}
          label="Google Calendar"
          doneLabel="Opened"
          run={() => bridge.openGoogleCalendar(report.id)}
        />
        <ExportButton icon={Download} label=".ics" doneLabel="Saved" run={() => bridge.saveIcs(report.id)} />
        <button
          type="button"
          onClick={onClose}
          className="ml-auto h-7 rounded-lg bg-emerald-400 px-3 text-[12px] font-semibold text-black transition-colors hover:bg-emerald-300"
        >
          Done
        </button>
      </div>
    </div>
  );
}
