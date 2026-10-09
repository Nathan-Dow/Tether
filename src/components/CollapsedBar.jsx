import { CircleCheck } from 'lucide-react';
import { modKey } from '../lib/bridge.js';
import ContextChip from './ContextChip.jsx';
import Grip from './Grip.jsx';

function Heartbeat({ active, ambient = false }) {
  return (
    <span className="relative flex size-2.5 shrink-0">
      {active && !ambient && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={`relative inline-flex size-2.5 rounded-full ${
          !active
            ? 'bg-zinc-600'
            : ambient
              ? 'animate-pulse bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]'
              : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
        }`}
      />
    </span>
  );
}

export default function CollapsedBar({ sprint, countdown, context, onOpen }) {
  const running = sprint && !countdown.done;
  const ambient = sprint?.mode === 'ambient';

  return (
    <div className="absolute inset-x-0 top-0 flex h-[52px] items-center gap-2 pr-5 pl-2">
      <Grip />

      {/* What's in focus right now — gets the roomy left side of the pill. */}
      {context?.current && (
        <>
          <div
            className="relative flex max-w-[50%] min-w-0 items-center">
            <ContextChip context={context} />
          </div>
          <span className="h-4 w-px shrink-0 bg-white/10" />
        </>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
      >
        {sprint && countdown.done ? (
          <>
            <CircleCheck size={14} className="shrink-0 text-emerald-400" />
            <span className="truncate text-[13px] font-medium text-zinc-100">Sprint complete</span>
          </>
        ) : (
          <>
            <Heartbeat active={running} ambient={ambient} />
            {ambient ? (
              <span className="truncate text-[13px] font-medium text-zinc-300">
                Ambient <span className="font-normal text-zinc-500">· logging quietly</span>
              </span>
            ) : sprint ? (
              <span className="truncate text-[13px] font-medium text-zinc-200">{sprint.goal}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-400">
                <span className="truncate">Set a sprint</span>
                <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-px font-sans text-[10px] text-zinc-400">
                  {modKey} K
                </kbd>
              </span>
            )}
          </>
        )}
      </button>

      {sprint && (
        <span
          title={ambient ? 'Time in Ambient Mode' : undefined}
          className={`shrink-0 font-mono text-[15px] font-semibold tabular-nums ${
            countdown.done ? 'text-emerald-300' : ambient ? 'text-zinc-500' : 'text-zinc-50'
          }`}
        >
          {countdown.label}
        </span>
      )}
    </div>
  );
}
