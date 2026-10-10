import { motion } from 'framer-motion';
import { AppWindow, ArrowDown, Cpu, Smartphone, TriangleAlert } from 'lucide-react';

const ENGINE = {
  model: (d) => `Local model · ${d.latencyMs}ms`,
  cache: () => 'Local model · cached',
  rules: () => 'Rules fallback',
  mock: () => 'Demo drift',
  vision: (d) => (d.demo ? 'Vision Sentinel · demo' : 'Vision Sentinel · on-device'),
};

export default function DriftCard({ drift, sprint, countdown, onBack, onRelated }) {
  const pct = Math.round(Math.max(0, Math.min(1, drift.confidence)) * 100);
  const physical = drift.source === 'vision';
  const AppIcon = physical ? Smartphone : AppWindow;

  return (
    <div className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
      {/* Header: label + confidence meter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-amber-300 uppercase">
          <TriangleAlert size={14} />
          {physical ? 'Physical drift' : 'Drift detected'}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-amber-500 to-amber-300"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            />
          </div>
          <span className="font-mono text-amber-200 tabular-nums">{pct}%</span>
          <span>conf.</span>
        </div>
      </div>

      {/* Offending app vs declared goal */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10 text-amber-300">
          <AppIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-zinc-50">{drift.app}</div>
          <div className="truncate text-[12px] text-zinc-500">
            Goal · {sprint?.goal ?? 'No sprint declared'}
          </div>
        </div>
      </div>

      {/* Corrective nudge, pointing back down at the work */}
      <div className="flex items-center gap-2.5">
        <motion.span
          className="shrink-0 text-amber-300"
          animate={{ y: [0, 3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ArrowDown size={15} strokeWidth={2.5} />
        </motion.span>
        <p className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{drift.nudge}</p>
        {sprint && (
          <span className="shrink-0 font-mono text-[12px] text-zinc-500 tabular-nums">
            {countdown.label}
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {ENGINE[drift.source] && (
          <span
            title={drift.reason}
            className="mr-auto flex items-center gap-1.5 text-[10.5px] text-zinc-600"
          >
            <Cpu size={11} />
            {ENGINE[drift.source](drift)}
          </span>
        )}
        {onRelated && (
        <button
          type="button"
          onClick={onRelated}
          className="h-7 rounded-lg px-3 text-[12px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
          It&apos;s related
        </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="h-7 rounded-lg bg-amber-400 px-3 text-[12px] font-semibold text-black transition-colors hover:bg-amber-300"
        >
          Back to it
        </button>
      </div>
    </div>
  );
}
