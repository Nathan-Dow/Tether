import { Cpu } from 'lucide-react';

const STATES = {
  ready: { dot: 'bg-emerald-400', text: 'text-zinc-500', label: (m) => `${m} · on-device` },
  'missing-model': { dot: 'bg-amber-400', text: 'text-amber-300/80', label: (m) => `${m} not pulled · rules mode` },
  offline: { dot: 'bg-amber-400', text: 'text-amber-300/80', label: () => 'Ollama offline · rules mode' },
};

// Which engine is judging focus right now.
export default function AiStatus({ health }) {
  if (!health) return null;
  const s = STATES[health.status] ?? STATES.offline;
  return (
    <span
      title={s.label(health.model)}
      className={`flex min-w-0 items-center gap-1.5 text-[10.5px] whitespace-nowrap ${s.text}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${s.dot}`} />
      <Cpu size={11} className="shrink-0 opacity-70" />
      <span className="truncate">{s.label(health.model)}</span>
    </span>
  );
}
