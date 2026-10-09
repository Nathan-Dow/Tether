import { useState } from 'react';
import { Check } from 'lucide-react';

// Button that runs an async export and briefly confirms the result.
export default function ExportButton({ icon: Icon, label, doneLabel, run, small = false, title }) {
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
      title={title}
      className={`flex items-center gap-1.5 rounded-lg border transition-colors ${
        small ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]'
      } ${
        done
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
          : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-zinc-50'
      }`}
    >
      {done ? <Check size={small ? 12 : 13} /> : <Icon size={small ? 12 : 13} />}
      {done ? doneLabel : label}
    </button>
  );
}
