// Attention states shared by the island ribbon and the dashboard.
// Colors validated (dataviz validate_palette.js, dark surface #09090b, all
// pairs): focus/drift sit in the CVD warning band, so state is always also
// named in text (legend, tooltip, table chip) - never color alone.
export const STATES = {
  focus: { label: 'Focus', color: '#059669' },
  drift: { label: 'Drift', color: '#d97706' },
  debug: { label: 'Debugging', color: '#0284c7' },
  idle: { label: 'Idle', color: '#3f3f46' },
  none: { label: 'No data', color: '#27272a' },
};

export const stateOf = (key) => STATES[key] ?? STATES.none;
