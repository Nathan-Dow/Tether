import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CornerDownLeft, LayoutDashboard, Mic, Play, Radar, Target, X } from 'lucide-react';
import { bridge } from '../lib/bridge.js';
import AiStatus from './AiStatus.jsx';

const PRESETS = [15, 25, 45, 60];
const AUTO_START_S = 3;

// Sprint | Ambient toggle. A sprint has a goal and a timer and nudges you when
// you drift; Ambient Mode has neither and only logs, silently.
function ModeToggle({ kind, setKind }) {
  const tab = (value, Icon, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === value}
      onClick={() => setKind(value)}
      className={`flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors ${
        kind === value
          ? value === 'ambient'
            ? 'bg-sky-400/15 text-sky-200'
            : 'bg-emerald-400/15 text-emerald-200'
          : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
  return (
    <div role="tablist" className="flex shrink-0 rounded-lg border border-white/10 p-0.5">
      {tab('sprint', Target, 'Sprint')}
      {tab('ambient', Radar, 'Ambient')}
    </div>
  );
}

// prefill: a spoken goal ({ goal, durationMin, domain, transcript }). It
// starts on its own after a short countdown unless you touch anything.
export default function GoalInput({ sprint, aiHealth, prefill, onStart, onStartAmbient, onCancel, onEnd, onVoice }) {
  const [kind, setKind] = useState(!prefill && sprint?.mode === 'ambient' ? 'ambient' : 'sprint');
  const ambientOn = sprint?.mode === 'ambient';
  const [goal, setGoal] = useState(prefill?.goal ?? sprint?.goal ?? '');
  const [duration, setDuration] = useState(prefill?.durationMin ?? sprint?.durationMin ?? 25);
  const [autoIn, setAutoIn] = useState(prefill ? AUTO_START_S : null);
  const inputRef = useRef(null);
  const stopAuto = () => setAutoIn(null);

  useEffect(() => {
    if (autoIn == null) return undefined;
    if (autoIn === 0) {
      if (goal.trim() && duration > 0) onStart(goal.trim(), duration);
      return undefined;
    }
    const t = setTimeout(() => setAutoIn((n) => (n == null ? n : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [autoIn]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (kind === 'ambient') {
      if (!ambientOn) onStartAmbient();
    } else if (canStart) onStart(goal.trim(), duration);
  };

  return (
    <form
      onSubmit={submit}
      // Any interaction with a spoken goal hands control back to you; the
      // first Esc only stops the countdown.
      onPointerDown={(e) => {
        if (autoIn != null && !e.target.closest('[type="submit"]')) stopAuto();
      }}
      onKeyDown={(e) => {
        if (autoIn == null || e.key === 'Enter') return;
        stopAuto();
        if (e.key === 'Escape') e.stopPropagation();
      }}
      className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4"
    >
      <div className="flex items-center justify-between">
        {prefill ? (
          <div
            className="flex shrink-0 items-center gap-2 text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-zinc-400 uppercase"
            title={prefill.transcript ? `Heard: "${prefill.transcript}"` : undefined}
          >
            <Mic size={13} className="text-sky-300" />
            Voice sprint
            {prefill.domain && (
              <span className="truncate rounded border border-white/10 px-1.5 py-px text-[10px] font-medium tracking-normal text-zinc-400 normal-case">
                {prefill.domain}
              </span>
            )}
          </div>
        ) : (
          <ModeToggle kind={kind} setKind={setKind} />
        )}
        <div className="flex min-w-0 items-center gap-1.5 pl-3">
          {/* A spoken goal needs the room for its domain chip. */}
          {!prefill && <AiStatus health={aiHealth} />}
          <button
            type="button"
            onClick={() => bridge.openDashboard()}
            title="Open the focus dashboard"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <LayoutDashboard size={13} />
          </button>
          {sprint && (
            <button
              type="button"
              onClick={onEnd}
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] whitespace-nowrap text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-300"
            >
              {ambientOn ? 'End ambient' : 'End sprint'}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            title="Close (Esc)"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {kind === 'ambient' ? (
        <>
          <p className="text-[12.5px] leading-snug text-zinc-400">
            No goal, no timer, no pop-ups. Tether checks the window every 10 s, groups your activity into 15-minute
            buckets (Coding, Research, Messaging…) and logs drift to the dashboard.
          </p>
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[11px] text-zinc-600">
              Drift judged on-device · labels apply
            </span>
            <button
              type="submit"
              disabled={ambientOn}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-sky-400 px-3 text-[12.5px] font-semibold whitespace-nowrap text-black transition-colors hover:bg-sky-300 disabled:bg-white/5 disabled:text-zinc-500"
            >
              <Radar size={13} />
              {ambientOn ? 'Ambient is on' : sprint ? 'Switch to ambient' : 'Start ambient'}
            </button>
          </div>
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            value={goal}
            onChange={(e) => {
              stopAuto();
              setGoal(e.target.value);
            }}
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
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                onVoice?.();
              }}
              title="Speak your goal: hold to talk, or tap and pause when done (Ctrl+Shift+Space)"
              className="ml-auto flex size-8 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-400 transition-colors hover:bg-sky-400/15 hover:text-sky-300"
            >
              <Mic size={14} />
            </button>
            <button
              type="submit"
              disabled={!canStart}
              className="relative flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg bg-emerald-400 pr-2 pl-3 text-[12.5px] font-semibold text-black transition-all hover:bg-emerald-300 disabled:bg-white/5 disabled:text-zinc-600"
            >
              {autoIn != null && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-black/15"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: AUTO_START_S, ease: 'linear' }}
                />
              )}
              <Play size={12} fill="currentColor" className="relative" />
              <span className="relative whitespace-nowrap tabular-nums">
                {autoIn != null ? `Start in ${autoIn}` : sprint ? 'Restart' : 'Start'}
              </span>
              {autoIn == null && <CornerDownLeft size={12} className="relative opacity-60" />}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
