import { useState } from 'react';
import { Check, Copy, CornerDownRight, Cpu, FileCode, History, SquareTerminal, X } from 'lucide-react';
import { bridge } from '../lib/bridge.js';
import { fmtDuration } from '../lib/format.js';

function Chip({ icon: Icon, children, alert = false, title }) {
  return (
    <span
      title={title}
      className="flex max-w-[50%] min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-zinc-300"
    >
      <Icon size={11} className={`shrink-0 ${alert ? 'text-red-400' : 'text-zinc-500'}`} />
      <span className="truncate">{children}</span>
    </span>
  );
}

// "Welcome back" after an interruption: what you were doing, the next step,
// and a copyable resume prompt with the facts.
export default function ResumeCard({ resume, onClose }) {
  const [copied, setCopied] = useState(false);
  const away = resume.interruption;

  const copy = async () => {
    if (await bridge.copyText(resume.prompt).catch(() => false)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between px-5 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-sky-300 uppercase">
          <History size={14} />
          Welcome back
        </div>
        <div className="flex items-center gap-2">
          {away && (
            <span className="text-[11px] text-zinc-500">
              {away.kind === 'drift' ? `${away.site ?? 'Drift'} · ` : 'Away · '}
              <span className="font-mono">{fmtDuration(away.ms)}</span>
            </span>
          )}
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

      <div>
        <p className="line-clamp-2 text-[13.5px] leading-snug text-zinc-100">{resume.summary}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-400">
          <CornerDownRight size={13} className="shrink-0 text-sky-300" />
          <span className="truncate">{resume.nextStep}</span>
        </p>
      </div>

      {(resume.file || resume.command) && (
        <div className="flex min-w-0 items-center gap-1.5">
          {resume.file && (
            <Chip icon={FileCode} title={resume.project ? `${resume.file} · ${resume.project}` : resume.file}>
              {resume.file}
            </Chip>
          )}
          {resume.command && (
            <Chip
              icon={SquareTerminal}
              alert={resume.failing}
              title={resume.failing ? `${resume.command} (failing)` : resume.command}
            >
              {resume.command}
            </Chip>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="mr-auto flex items-center gap-1.5 text-[10.5px] text-zinc-600">
          <Cpu size={11} />
          {resume.source === 'model' ? `Local model · ${resume.latencyMs}ms` : 'Template'}
        </span>
        <button
          type="button"
          onClick={copy}
          className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
            copied
              ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
              : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-zinc-50'
          }`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy resume prompt'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-7 rounded-lg bg-sky-400 px-3 text-[12px] font-semibold text-black transition-colors hover:bg-sky-300"
        >
          Back to it
        </button>
      </div>
    </div>
  );
}
