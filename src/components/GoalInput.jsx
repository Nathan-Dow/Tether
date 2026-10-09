import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Play, Target, X } from 'lucide-react';
import { bridge } from '../lib/bridge.js';
import AiStatus from './AiStatus.jsx';

const PRESETS = [15, 25, 45, 60];

export default function GoalInput({ sprint, aiHealth, onStart, onCancel, onEnd }) {
  const [goal, setGoal] = useState(sprint?.goal ?? '');
  const [duration, setDuration] = useState(sprint?.durationMin ?? 25);
  const inputRef = useRef(null);

  // The island normally sits inactive; grab OS focus so typing lands here.
  useEffect(() => {
    bridge.focus();
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);

  const canStart = goal.trim().length > 0 && duration > 0;
  const isCustom = !PRESETS.includes(duration);

  const submit = (e) => {
    e.preventDefault();
    if (canStart) onStart(goal.trim(), duration);
  };

  return (
    <form onSubmit={submit} className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-zinc-400 uppercase">
          <Target size={13} className="text-emerald-400" />
          {sprint ? 'Update sprint' : 'Declare sprint'}
        </div>
        <div className="flex items-center gap-1.5">
          <AiStatus health={aiHealth} />
          {sprint && (
            <button
              type="button"
              onClick={onEnd}
              className="rounded-md px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-300"
            >
              End sprint
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            title="Close (Esc)"
            className="flex size-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        maxLength={120}
        placeholder="What are you shipping? e.g. Finish the auth refactor"
        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[15px] text-zinc-50 placeholder:text-zinc-600 outline-none transition-colors focus:border-emerald-400/40 focus:bg-white/[0.06]"
      />

      <div className="flex items-center gap-1.5">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setDuration(m)}
            className={`h-8 rounded-lg px-2.5 font-mono text-[12px] tabular-nums transition-colors ${
              duration === m
                ? 'bg-zinc-100 text-black'
                : 'bg-white/[0.04] text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
            }`}
          >
            {m}m
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={240}
          value={isCustom ? duration : ''}
          onChange={(e) => setDuration(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
          placeholder="min"
          className={`h-8 w-12 rounded-lg border bg-white/[0.04] px-2 text-center font-mono text-[12px] tabular-nums text-zinc-100 placeholder:text-zinc-600 outline-none ${
            isCustom && duration > 0 ? 'border-zinc-300/60' : 'border-white/5'
          }`}
        />

        <button
          type="submit"
          disabled={!canStart}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg bg-emerald-400 pr-2 pl-3 text-[12.5px] font-semibold text-black transition-all hover:bg-emerald-300 disabled:bg-white/5 disabled:text-zinc-600"
        >
          <Play size={12} fill="currentColor" />
          {sprint ? 'Restart' : 'Start'}
          <CornerDownLeft size={12} className="opacity-60" />
        </button>
      </div>
    </form>
  );
}
