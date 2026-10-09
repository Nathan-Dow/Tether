import { GripVertical } from 'lucide-react';
import { bridge } from '../lib/bridge.js';

// Shared so the island doesn't drop back to click-through mid-drag.
let dragging = false;
export const isDragging = () => dragging;

export default function Grip() {
  const end = () => {
    if (!dragging) return;
    dragging = false;
    bridge.dragEnd();
  };

  return (
    <div
      title="Drag to move · double-click to re-center"
      className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded-full text-zinc-600 transition-colors hover:text-zinc-300 active:cursor-grabbing"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging = true;
        bridge.dragStart();
      }}
      onPointerUp={end}
      onLostPointerCapture={end}
      onDoubleClick={() => bridge.recenter()}
    >
      <GripVertical size={14} strokeWidth={2.25} />
    </div>
  );
}
