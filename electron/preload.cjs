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

  // Air-gap egress counter
  getNetStats: () => ipcRenderer.invoke('net:get'),
  onNetStats: (cb) => subscribe('net:stats', cb),

  // Global shortcut events from main ('open-input')
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

  // Calendar export for a finished sprint
  openGoogleCalendar: (id) => ipcRenderer.invoke('calendar:google', id),
  saveIcs: (id) => ipcRenderer.invoke('calendar:ics', id),
});
