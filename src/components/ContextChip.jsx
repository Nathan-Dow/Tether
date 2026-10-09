import { AnimatePresence, motion } from 'framer-motion';
import {
  AppWindow,
  Code2,
  Globe,
  Monitor,
  MessageCircle,
  Music,
  NotebookPen,
  Palette,
  SquareTerminal,
} from 'lucide-react';

const ICONS = {
  browser: Globe,
  editor: Code2,
  terminal: SquareTerminal,
  chat: MessageCircle,
  media: Music,
  design: Palette,
  notes: NotebookPen,
  idle: Monitor,
  other: AppWindow,
};

// The app/page currently in focus, as seen by the context daemon.
export default function ContextChip({ context }) {
  const current = context?.current;
  if (!current) return null;

  const Icon = ICONS[current.category] ?? AppWindow;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={`${current.app}|${current.label}`}
        title={current.title || current.app}
        className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-zinc-400"
        initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
        transition={{ duration: 0.22 }}
      >
        <Icon
          size={12}
          className={`shrink-0 ${current.errorSignal ? 'text-red-400' : 'text-zinc-500'}`}
        />
        <span className="truncate">{current.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}
