import { useEffect, useRef } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { STATES } from '../lib/states.js';

const OPTIONS = [
  {
    value: 'focus',
    label: 'Always on-task',
    hint: 'Focus, or Debugging when the title shows errors',
    color: STATES.focus.color,
  },
  {
    value: 'drift',
    label: 'Always drift',
    hint: 'Counts as drift and triggers the nudge',
    color: STATES.drift.color,
  },
  { value: null, label: 'Let the AI decide', hint: "Use the local model's verdict", Icon: Sparkles },
];

const MENU_W = 248;
const MENU_H = 196;

// Pop-up for labelling a site or app yourself. Anchored to the clicked cell
// with fixed positioning so the scrolling table can't clip it.
export default function LabelMenu({ site, current, anchor, onPick, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    // Clicks on a trigger are left to the trigger, which toggles the menu.
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-label-trigger]')) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const below = anchor.bottom + 4 + MENU_H <= window.innerHeight;
  const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - 4 - MENU_H);
  const left = Math.min(anchor.left, window.innerWidth - MENU_W - 8);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ top, left, width: MENU_W }}
      className="fixed z-50 rounded-xl border border-white/[0.08] bg-[#131316] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
    >
      <div className="truncate px-2.5 pt-1.5 pb-2 text-[11px] text-zinc-500">
        Label <span className="text-zinc-200">{site}</span>
      </div>
      {OPTIONS.map((o) => {
        const active = (current ?? null) === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
          >
            <span className="mt-[3px] flex size-3 shrink-0 items-center justify-center">
              {o.Icon ? (
                <o.Icon size={12} className="text-zinc-400" />
              ) : (
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: o.color }} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-zinc-100">{o.label}</span>
              <span className="block text-[11px] text-zinc-500">{o.hint}</span>
            </span>
            {active && <Check size={13} className="mt-[3px] shrink-0 text-zinc-300" />}
          </button>
        );
      })}
      <div className="mt-1 border-t border-white/[0.06] px-2.5 pt-1.5 pb-1 text-[10.5px] text-zinc-600">
        Applies to every sprint, past and future.
      </div>
    </div>
  );
}
