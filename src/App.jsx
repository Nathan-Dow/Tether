import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { bridge } from './lib/bridge.js';
import { useCountdown } from './hooks/useCountdown.js';
import { useVoice } from './hooks/useVoice.js';
import { useVisionSentinel } from './hooks/useVisionSentinel.js';
import { playDrift, playGoalSet } from './lib/sounds.js';
import { EXPANDED_MODES, useIsland } from './state/useIsland.js';
import Island from './components/Island.jsx';
import CollapsedBar from './components/CollapsedBar.jsx';
import GoalInput from './components/GoalInput.jsx';
import DriftCard from './components/DriftCard.jsx';
import SummaryCard from './components/SummaryCard.jsx';
import ResumeCard from './components/ResumeCard.jsx';
import VoiceCard from './components/VoiceCard.jsx';

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
  const [{ mode, sprint, drift, summary, resume, prefill }, dispatch] = useIsland();
  const countdown = useCountdown(sprint);
  const [context, setContext] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);

  // Voice goals: the transcript and parsed sprint land in the goal card.
  const voice = useVoice({ onResult: (intent) => dispatch({ type: 'VOICE_RESULT', intent }) });
  const startVoice = (opts) => {
    dispatch({ type: 'VOICE_START' });
    voice.start(opts);
  };
  const cancelVoice = () => {
    voice.cancel();
    dispatch({ type: 'VOICE_CANCEL' });
  };
  const toggleVoice = () => {
    if (voice.phase === 'listening') voice.stop();
    else if (voice.phase !== 'thinking') startVoice();
  };
  const voiceRef = useRef(toggleVoice);
  voiceRef.current = toggleVoice;

  // Audio cues: a chime when a sprint starts, a low tone when you drift.
  const startedAt = sprint?.startedAt;
  useEffect(() => {
    if (startedAt) playGoalSet();
  }, [startedAt]);
  useEffect(() => {
    if (drift) playDrift();
  }, [drift]);

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
        if (name === 'voice') voiceRef.current();
        if (name === 'phone-demo') toggleDemoRef.current();
      }),
    [dispatch],
  );

  // Tell the local evaluator what we're working on; stop it when time's up.
  const activeSprint = sprint && !countdown.done ? sprint : null;
  useEffect(() => {
    bridge.setSprint(activeSprint);
  }, [activeSprint]);

  // Vision Sentinel: webcam presence + smartphone corroboration during a
  // sprint. A pickup morphs the island amber and lands in the Friction ledger.
  const vision = useVisionSentinel({ active: Boolean(activeSprint) });
  const toggleDemoRef = useRef(vision.toggleDemo);
  toggleDemoRef.current = vision.toggleDemo;
  const { phoneDetected, source: phoneSource, clearDemo } = vision;
  useEffect(() => {
    bridge.reportPhone({ phoneDetected, source: phoneSource });
    if (!phoneDetected) {
      dispatch({ type: 'PHONE_DOWN' });
      return;
    }
    dispatch({
      type: 'DRIFT',
      drift: {
        app: 'Smartphone detected',
        confidence: phoneSource === 'demo' ? 0.92 : 0.8,
        nudge: 'Return attention to sprint.',
        reason: 'Vision Sentinel saw a phone in frame',
        source: 'vision',
        demo: phoneSource === 'demo',
      },
    });
  }, [phoneDetected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local AI status (Ollama ready / offline -> rules fallback).
  useEffect(() => {
    bridge.getAiHealth().then((h) => h && setAiHealth(h));
    return bridge.onAiHealth(setAiHealth);
  }, []);

  // The main process finalizes the session when the sprint stops and sends
  // its report back for the post-sprint breakdown.
  useEffect(
    () => bridge.onSessionFinished((report) => dispatch({ type: 'SHOW_SUMMARY', report })),
    [dispatch],
  );

  // Welcome-back note after coming back from an interruption.
  useEffect(() => bridge.onResume((r) => dispatch({ type: 'RESUME', resume: r })), [dispatch]);

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

  // In-island keyboard: Cmd/Ctrl+K input, Esc collapse, and rehearsal
  // shortcuts Cmd/Ctrl+Shift+D (mock drift), Cmd/Ctrl+Shift+S (demo summary),
  // Cmd/Ctrl+Shift+R (resume note) and Cmd/Ctrl+Shift+W (phone in hand).
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
      } else if (mod && e.shiftKey && key === 's') {
        e.preventDefault();
        bridge.getDayReport({ demo: true }).then((rep) => {
          if (rep?.sessions[0]) dispatch({ type: 'SHOW_SUMMARY', report: rep.sessions[0] });
        });
      } else if (mod && e.shiftKey && key === 'w') {
        // Also a global shortcut; this catches it if registration failed.
        e.preventDefault();
        toggleDemoRef.current();
      } else if (mod && e.shiftKey && key === 'r') {
        e.preventDefault();
        bridge.previewResume();
      } else if (key === 'escape') {
        if (mode === 'input') dispatch({ type: 'CANCEL_INPUT' });
        else if (mode === 'drift') dispatch({ type: 'DISMISS_DRIFT' });
        else if (mode === 'summary') dispatch({ type: 'CLOSE_SUMMARY' });
        else if (mode === 'resume') dispatch({ type: 'CLOSE_RESUME' });
        else if (mode === 'voice') cancelVoice();
      } else if (key === 'f12') {
        bridge.toggleDevTools();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, sprint, countdown.label, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Island mode={mode}>
      <AnimatePresence initial={false}>
        {mode === 'input' && (
          <View key={`input-${prefill?.id ?? 'typed'}`}>
            <GoalInput
              key={prefill?.id ?? 'typed'}
              sprint={sprint}
              aiHealth={aiHealth}
              prefill={prefill}
              onVoice={() => startVoice({ hold: true })}
              onStart={(goal, durationMin) => dispatch({ type: 'START_SPRINT', goal, durationMin })}
              onStartAmbient={() =>
                dispatch({ type: 'START_SPRINT', goal: 'Ambient', durationMin: null, mode: 'ambient' })
              }
              onCancel={() => dispatch({ type: 'CANCEL_INPUT' })}
              onEnd={() => dispatch({ type: 'END_SPRINT' })}
            />
          </View>
        )}

        {mode === 'voice' && (
          <View key="voice">
            <VoiceCard voice={voice} onClose={cancelVoice} onRetry={() => voice.start()} />
          </View>
        )}

        {mode === 'drift' && drift && (
          <View key="drift">
            <DriftCard
              drift={drift}
              sprint={sprint}
              countdown={countdown}
              onBack={() => {
                if (drift.source === 'vision') clearDemo();
                dispatch({ type: 'DISMISS_DRIFT' });
              }}
              onRelated={
                drift.source === 'vision'
                  ? null
                  : () => {
                      bridge.allowContext(drift.key);
                      dispatch({ type: 'DISMISS_DRIFT' });
                    }
              }
            />
          </View>
        )}

        {mode === 'summary' && summary && (
          <View key="summary">
            <SummaryCard report={summary} onClose={() => dispatch({ type: 'CLOSE_SUMMARY' })} />
          </View>
        )}

        {mode === 'resume' && resume && (
          <View key="resume">
            <ResumeCard resume={resume} onClose={() => dispatch({ type: 'CLOSE_RESUME' })} />
          </View>
        )}

        {!EXPANDED_MODES.has(mode) && (
          <View key="bar">
            <CollapsedBar
              sprint={sprint}
              countdown={countdown}
              context={context}
              vision={vision}
              onOpen={() => dispatch({ type: 'OPEN_INPUT' })}
            />
          </View>
        )}
      </AnimatePresence>
    </Island>
  );
}
