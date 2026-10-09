import { useReducer } from 'react';

// Island modes:
//   idle    — no sprint running, collapsed
//   input   — expanded goal/duration entry (Cmd/Ctrl+K)
//   flow    — sprint running, collapsed with countdown
//   drift   — expanded amber warning
//   summary — expanded post-sprint breakdown + calendar export
//   resume  — expanded "welcome back" note after an interruption
export const EXPANDED_MODES = new Set(['input', 'drift', 'summary', 'resume']);

const initialState = {
  mode: 'idle',
  sprint: null, // { goal, durationMin, startedAt }
  drift: null, // { app, confidence, nudge, reason, key, source, latencyMs, driftType }
  summary: null, // sessionReport() of the sprint that just finished
  resume: null, // resume snapshot + note
};

function restingMode(state) {
  return state.sprint ? 'flow' : 'idle';
}

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN_INPUT':
      return { ...state, mode: 'input' };

    case 'CANCEL_INPUT':
      return { ...state, mode: state.drift ? 'drift' : restingMode(state) };

    case 'START_SPRINT':
      return {
        ...state,
        mode: 'flow',
        drift: null,
        sprint: {
          goal: action.goal,
          durationMin: action.durationMin,
          startedAt: Date.now(),
        },
      };

    case 'END_SPRINT':
      return { ...state, mode: 'idle', sprint: null, drift: null };

    case 'DRIFT':
      // Never yank the user out of typing their goal.
      if (state.mode === 'input') return state;
      return { ...state, mode: 'drift', drift: action.drift };

    case 'VERDICT':
      // Back on task: the warning clears itself. Mock drifts stay put so
      // they can be rehearsed.
      if (
        state.mode === 'drift' &&
        !action.verdict.isDistracted &&
        state.drift?.source !== 'mock'
      ) {
        return { ...state, mode: restingMode(state), drift: null };
      }
      return state;

    case 'SHOW_SUMMARY':
      // The sprint is over (time's up or ended early); its report replaces it.
      return { ...state, mode: 'summary', sprint: null, drift: null, summary: action.report };

    case 'RESUME':
      // Don't cover the goal input or a sprint summary.
      if (state.mode === 'input' || state.mode === 'summary') return state;
      return { ...state, mode: 'resume', drift: null, resume: action.resume };

    case 'CLOSE_RESUME':
      return { ...state, mode: restingMode(state), resume: null };

    case 'CLOSE_SUMMARY':
      return { ...state, mode: restingMode(state), summary: null };

    case 'DISMISS_DRIFT':
      return { ...state, mode: restingMode(state), drift: null };

    default:
      return state;
  }
}

export function useIsland() {
  return useReducer(reducer, initialState);
}
