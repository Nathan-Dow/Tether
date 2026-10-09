import { motion } from 'framer-motion';
import { LoaderCircle, Mic, MicOff, RotateCcw, X } from 'lucide-react';

const ERRORS = {
  missing: ['Voice model not installed', 'Run npm run setup:voice once, then try again.'],
  denied: ['Microphone blocked', 'Allow desktop apps in Windows Settings › Privacy › Microphone.'],
  'no-mic': ['No microphone found', 'Plug one in or pick an input device in Windows sound settings.'],
  'no-speech': ["Didn't catch that", 'Say a goal and a time, e.g. "30 minutes on the auth tests".'],
  empty: ["Didn't catch that", 'Say a goal and a time, e.g. "30 minutes on the auth tests".'],
  failed: ['Transcription failed', 'Try again, or type the goal with Ctrl+K.'],
};

// Live level meter: the newest sample enters on the right.
function Wave({ levels, active }) {
  return (
    <div className="flex h-12 items-center justify-center gap-[3px]" aria-hidden>
      {levels.map((v, i) => (
        <motion.span
          key={i}
          className="w-[4px] rounded-full bg-sky-300"
          animate={{ height: active ? 4 + v * 40 : 4, opacity: active ? 0.35 + v * 0.65 : 0.25 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      ))}
    </div>
  );
}

export default function VoiceCard({ voice, onClose, onRetry }) {
  const { phase, error, levels } = voice;
  const [title, hint] = ERRORS[error] ?? ERRORS.failed;

  return (
    <div className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-sky-300 uppercase">
          {phase === 'error' ? <MicOff size={13} /> : <Mic size={13} />}
          {phase === 'thinking' ? 'Understanding' : phase === 'error' ? 'Voice' : 'Listening'}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Cancel (Esc)"
          className="flex size-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
        >
          <X size={14} />
        </button>
      </div>

      {phase === 'error' ? (
        <div>
          <p className="text-[14px] text-zinc-100">{title}</p>
          <p className="mt-1 text-[12px] text-zinc-500">{hint}</p>
        </div>
      ) : (
        <Wave levels={levels} active={phase === 'listening'} />
      )}

      <div className="flex items-center justify-between gap-3">
        {phase === 'listening' && (
          <>
            <span className="truncate text-[12px] text-zinc-400">
              Say a goal and a time · <span className="text-zinc-500">pause or release to finish</span>
            </span>
            <button
              type="button"
              onClick={voice.stop}
              className="h-7 shrink-0 rounded-lg bg-sky-400 px-3 text-[12px] font-semibold text-black transition-colors hover:bg-sky-300"
            >
              Done
            </button>
          </>
        )}
        {phase === 'thinking' && (
          <span className="flex items-center gap-2 text-[12px] text-zinc-400">
            <LoaderCircle size={13} className="animate-spin text-sky-300" />
            Transcribing and reading your goal on this device…
          </span>
        )}
        {phase === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-zinc-50"
          >
            <RotateCcw size={12} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
