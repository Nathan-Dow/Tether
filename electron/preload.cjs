// Narrow, typed bridge between the island UI and the main process.
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('tether', {
  platform: process.platform,

  // Window behaviour
  setInteractive: (interactive) => ipcRenderer.send('island:interactive', !!interactive),
  focus: () => ipcRenderer.send('island:focus'),
  dragStart: () => ipcRenderer.send('island:drag-start'),
  dragEnd: () => ipcRenderer.send('island:drag-end'),
  recenter: () => ipcRenderer.send('island:recenter'),
  toggleDevTools: () => ipcRenderer.send('island:devtools'),
  openDashboard: () => ipcRenderer.send('dashboard:open'),

  // Air-gap egress counter
  getNetStats: () => ipcRenderer.invoke('net:get'),
  onNetStats: (cb) => subscribe('net:stats', cb),

  // Global shortcut events from main ('open-input' | 'voice')
  onShortcut: (cb) => subscribe('shortcut', cb),

  // Foreground-window context (fires on focus change)
  getContext: () => ipcRenderer.invoke('context:get'),
  onContext: (cb) => subscribe('context:update', cb),

  // Local AI evaluation
  setSprint: (sprint) => ipcRenderer.send('sprint:set', sprint),
  allowContext: (key) => ipcRenderer.send('eval:allow', key),
  getAiHealth: () => ipcRenderer.invoke('ai:health'),
  getEvalLog: () => ipcRenderer.invoke('eval:log'),
  onAiHealth: (cb) => subscribe('ai:health', cb),
  onVerdict: (cb) => subscribe('eval:verdict', cb), // every evaluation
  onEvaluation: (cb) => subscribe('eval:result', cb), // drift alerts only

  // Session analytics
  getDayReport: (opts) => ipcRenderer.invoke('analytics:day', opts),
  getLastSession: () => ipcRenderer.invoke('analytics:last-session'),
  clearHistory: () => ipcRenderer.invoke('analytics:clear'),
  onSessionFinished: (cb) => subscribe('session:finished', cb),

  // Your own labels: { site: 'focus' | 'drift' }; label null = let the AI decide
  getLabels: () => ipcRenderer.invoke('labels:get'),
  setLabel: (site, label) => ipcRenderer.invoke('labels:set', { site, label }),
  onLabelsChanged: (cb) => subscribe('labels:changed', cb),

  // Resume Flow
  onResume: (cb) => subscribe('resume:show', cb),
  previewResume: () => ipcRenderer.send('resume:preview'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  // Voice goal input: Float32Array of 16 kHz mono samples -> { goal, durationMin, ... }
  getVoiceStatus: () => ipcRenderer.invoke('voice:status'),
  transcribe: (samples) => ipcRenderer.invoke('voice:transcribe', samples),

  // Vision Sentinel: { phoneDetected, source: 'camera' | 'demo' }
  reportPhone: (event) => ipcRenderer.send('vision:phone', event),
  // { at, present, gaze } per sample, or { status: 'on' | 'unavailable' }
  reportVisionSample: (sample) => ipcRenderer.send('vision:sample', sample),

  // Calendar export for a finished sprint
  openGoogleCalendar: (id) => ipcRenderer.invoke('calendar:google', id),
  saveIcs: (id) => ipcRenderer.invoke('calendar:ics', id),
});
