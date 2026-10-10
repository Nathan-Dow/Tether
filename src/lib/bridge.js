// window.tether is injected by electron/preload.cjs. In a plain browser tab
// (e.g. `vite` alone for quick styling work) fall back to harmless no-ops.
const noop = () => {};
const unsub = () => noop;

const fallback = {
  platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32',
  setInteractive: noop,
  focus: noop,
  dragStart: noop,
  dragEnd: noop,
  recenter: noop,
  toggleDevTools: noop,
  openDashboard: noop,
  getNetStats: async () => ({ external: 0, lastHost: null }),
  onNetStats: unsub,
  onShortcut: unsub,
  getContext: async () => null,
  onContext: unsub,
  setSprint: noop,
  allowContext: noop,
  getAiHealth: async () => null,
  getEvalLog: async () => [],
  onAiHealth: unsub,
  onVerdict: unsub,
  onEvaluation: unsub,
  getDayReport: async () => null,
  getLastSession: async () => null,
  clearHistory: async () => true,
  onSessionFinished: unsub,
  getLabels: async () => ({}),
  setLabel: async () => ({}),
  onLabelsChanged: unsub,
  onResume: unsub,
  previewResume: noop,
  copyText: async (text) => navigator.clipboard.writeText(text).then(() => true),
  getVoiceStatus: async () => ({ ready: false, reason: 'unsupported' }),
  transcribe: async () => ({ ok: false, error: 'missing' }),
  openGoogleCalendar: async () => ({ ok: false }),
  saveIcs: async () => ({ ok: false }),
  reportPhone: noop,
  reportVisionSample: noop,
};

export const bridge = window.tether ?? fallback;
export const isMac = bridge.platform === 'darwin';
export const modKey = isMac ? '⌘' : 'Ctrl';
