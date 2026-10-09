import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { bridge } from '../lib/bridge.js';
import { EXPANDED_MODES } from '../state/useIsland.js';
import { isDragging } from './Grip.jsx';

export const SPRING = { type: 'spring', stiffness: 380, damping: 32 };

const ISLAND_W = 420;
const COLLAPSED_H = 54;
const EXPANDED_H = { input: 180, drift: 180, summary: 196 };

// Per-mode accent.
const THEMES = {
  idle: { border: 'rgba(255,255,255,0.10)', glow: 'rgba(0,0,0,0)', pulse: false },
  flow: { border: 'rgba(255,255,255,0.10)', glow: 'rgba(0,0,0,0)', pulse: false },
  input: { border: 'rgba(255,255,255,0.14)', glow: 'rgba(0,0,0,0)', pulse: false },
  summary: { border: 'rgba(52,211,153,0.30)', glow: 'rgba(52,211,153,0.18)', pulse: false },
  drift: { border: 'rgba(251,191,36,0.45)', glow: 'rgba(251,191,36,0.38)', pulse: true },
};

export default function Island({ mode, children }) {
  const expanded = EXPANDED_MODES.has(mode);
  const theme = THEMES[mode] ?? THEMES.idle;
  const hovered = useRef(false);

  // Expanded states take the whole island interactive (e.g. summoned by the
  // global shortcut with the cursor elsewhere). On collapse, hand clicks back
  // to the desktop unless the cursor is actually over the pill.
  useEffect(() => {
    if (expanded) bridge.setInteractive(true);
    else if (!hovered.current && !isDragging()) bridge.setInteractive(false);
  }, [expanded]);

  return (
    <div className="flex justify-center pt-2.5">
      <motion.div
        className="relative"
        initial={{ y: -80, opacity: 0, width: ISLAND_W, height: COLLAPSED_H, borderRadius: 27 }}
        animate={{
          y: 0,
          opacity: 1,
          width: ISLAND_W,
          height: expanded ? EXPANDED_H[mode] : COLLAPSED_H,
          borderRadius: expanded ? 30 : 27,
        }}
        transition={SPRING}
        onMouseEnter={() => {
          hovered.current = true;
          bridge.setInteractive(true);
        }}
        onMouseLeave={() => {
          hovered.current = false;
          if (!isDragging() && !expanded) bridge.setInteractive(false);
        }}
      >
        {/* Glow lives behind the pill so it can bleed into the window padding. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: `0 0 42px 2px ${theme.glow}` }}
          animate={{ opacity: theme.pulse ? [0.55, 1, 0.55] : 1 }}
          transition={
            theme.pulse ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }
          }
        />

        <motion.div
          className="absolute inset-0 overflow-hidden rounded-[inherit] border border-white/10 bg-black/90 backdrop-blur-xl"
          animate={{ borderColor: theme.border }}
          transition={{ duration: 0.35 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}
