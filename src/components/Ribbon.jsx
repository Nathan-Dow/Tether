import { stateOf } from '../lib/states.js';

// Minute-by-minute attention ribbon (from metrics timelineOf).
export default function Ribbon({ timeline, className = 'h-2' }) {
  if (!timeline?.length) return null;
  return (
    <div className={`flex w-full gap-px overflow-hidden rounded-full ${className}`}>
      {timeline.map((b) => (
        <div
          key={b.t}
          title={stateOf(b.state).label}
          className="min-w-px flex-1"
          style={{ backgroundColor: stateOf(b.state).color }}
        />
      ))}
    </div>
  );
}
