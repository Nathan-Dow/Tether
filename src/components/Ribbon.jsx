// Minute-by-minute attention ribbon (from metrics timelineOf).
export const STATE_COLORS = {
  focus: 'bg-emerald-400',
  drift: 'bg-amber-400',
  debug: 'bg-cyan-400',
  idle: 'bg-zinc-700',
  none: 'bg-zinc-800/60',
};

export default function Ribbon({ timeline, className = 'h-2' }) {
  if (!timeline?.length) return null;
  return (
    <div className={`flex w-full gap-px overflow-hidden rounded-full ${className}`}>
      {timeline.map((b) => (
        <div key={b.t} className={`min-w-px flex-1 ${STATE_COLORS[b.state] ?? STATE_COLORS.none}`} />
      ))}
    </div>
  );
}
