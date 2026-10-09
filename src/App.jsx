import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bridge } from './lib/bridge.js';
import { useCountdown } from './hooks/useCountdown.js';
import { EXPANDED_MODES, useIsland } from './state/useIsland.js';
import Island from './components/Island.jsx';
import CollapsedBar from './components/CollapsedBar.jsx';
import GoalInput from './components/GoalInput.jsx';
import DriftCard from './components/DriftCard.jsx';

// Cross-fade between island contents while the shell springs to its new size.
function View({ children }) {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)', transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, delay: 0.06 }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [{ mode, sprint, drift }, dispatch] = useIsland();
  const countdown = useCountdown(sprint);
  const [context, setContext] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);

  // Foreground app from the OS context daemon (main process).
  useEffect(() => {
    bridge.getContext().then((state) => state && setContext(state));
    return bridge.onContext(setContext);
  }, []);

  // Global summon (Cmd/Ctrl+Shift+K) from the main process.
  useEffect(
    () =>
      bridge.onShortcut((name) => {
        if (name === 'open-input') dispatch({ type: 'OPEN_INPUT' });
      }),
    [dispatch],
  );

  // Tell the local evaluator what we're working on; stop it when time's up.
  const activeSprint = sprint && !countdown.done ? sprint : null;
  useEffect(() => {
    bridge.setSprint(activeSprint);
  }, [activeSprint]);

  // Local AI status (Ollama ready / offline -> rules fallback).
  useEffect(() => {
    bridge.getAiHealth().then((h) => h && setAiHealth(h));
    return bridge.onAiHealth(setAiHealth);
  }, []);

  // Drift alerts from the evaluator, plus every verdict so the warning can
  // clear itself once you're back on task.
  useEffect(() => {
    const offDrift = bridge.onEvaluation((result) => {
      if (!result?.isDistracted) return;
      dispatch({
        type: 'DRIFT',
        drift: {
          app: result.distractingApp,
          confidence: result.confidence,
          nudge: result.nudge,
          reason: result.reason,
          key: result.key,
          source: result.source,
          latencyMs: result.latencyMs,
          driftType: result.driftType,
        },
      });
    });
    const offVerdict = bridge.onVerdict((verdict) => dispatch({ type: 'VERDICT', verdict }));
    return () => {
      offDrift();
      offVerdict();
    };
  }, [dispatch]);

  // In-island keyboard: Cmd/Ctrl+K input, Esc collapse, Cmd/Ctrl+Shift+D mock drift.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault();
        dispatch({ type: 'OPEN_INPUT' });
      } else if (mod && e.shiftKey && key === 'd') {
        e.preventDefault();
        dispatch({
          type: 'DRIFT',
          drift: {
            app: 'YouTube — Google Chrome',
            confidence: 0.87,
            nudge: sprint
              ? `Back to "${sprint.goal}" — ${countdown.label} left.`
              : 'Close the tab and declare a sprint.',
            reason: 'Mock drift (dev shortcut)',
            source: 'mock',
          },
        });
      } else if (key === 'escape') {
        if (mode === 'input') dispatch({ type: 'CANCEL_INPUT' });
        else if (mode === 'drift') dispatch({ type: 'DISMISS_DRIFT' });
      } else if (key === 'f12') {
        bridge.toggleDevTools();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, sprint, countdown.label, dispatch]);

  return (
    <Island mode={mode}>
      <AnimatePresence initial={false}>
        {mode === 'input' && (
          <View key="input">
            <GoalInput
              sprint={sprint}
              aiHealth={aiHealth}
              onStart={(goal, durationMin) => dispatch({ type: 'START_SPRINT', goal, durationMin })}
              onCancel={() => dispatch({ type: 'CANCEL_INPUT' })}
              onEnd={() => dispatch({ type: 'END_SPRINT' })}
            />
          </View>
        )}

        {mode === 'drift' && drift && (
          <View key="drift">
            <DriftCard
              drift={drift}
              sprint={sprint}
              countdown={countdown}
              onBack={() => dispatch({ type: 'DISMISS_DRIFT' })}
              onRelated={() => {
                bridge.allowContext(drift.key);
                dispatch({ type: 'DISMISS_DRIFT' });
              }}
            />
          </View>
        )}

        {!EXPANDED_MODES.has(mode) && (
          <View key="bar">
            <CollapsedBar
              sprint={sprint}
              countdown={countdown}
              context={context}
              onOpen={() => dispatch({ type: 'OPEN_INPUT' })}
            />
          </View>
        )}
      </AnimatePresence>
    </Island>
  );
}
