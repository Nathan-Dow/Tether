// Turns a raw foreground-window sample into something the UI and the LLM can
// reason about: a friendly app name, a category, and a short label.

const CATEGORIES = {
  browser: ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx', 'arc', 'vivaldi', 'zen'],
  editor: [
    'code', 'code - insiders', 'cursor', 'windsurf', 'zed', 'devenv', 'idea64', 'pycharm64',
    'webstorm64', 'rider64', 'clion64', 'goland64', 'sublime_text', 'notepad++', 'nvim-qt',
    'studio64', 'unity', 'godot',
  ],
  terminal: [
    'windowsterminal', 'cmd', 'powershell', 'pwsh', 'wezterm-gui', 'alacritty', 'mintty',
    'conhost', 'warp', 'tabby', 'hyper',
  ],
  chat: ['discord', 'slack', 'teams', 'ms-teams', 'telegram', 'whatsapp', 'messenger', 'signal', 'zoom'],
  media: ['spotify', 'vlc', 'netflix', 'steam', 'epicgameslauncher', 'battle.net'],
  design: ['figma', 'photoshop', 'illustrator', 'blender', 'afterfx', 'premiere'],
  notes: ['obsidian', 'notion', 'onenote', 'winword', 'excel', 'powerpnt', 'notepad'],
};

const BY_PROCESS = new Map(
  Object.entries(CATEGORIES).flatMap(([cat, names]) => names.map((n) => [n, cat])),
);

// Nicer names than some exe FileDescriptions ("Visual Studio Code" is fine,
// "Windows Terminal Host" less so).
const FRIENDLY = {
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  code: 'VS Code',
  windowsterminal: 'Terminal',
  cmd: 'Command Prompt',
  powershell: 'PowerShell',
  pwsh: 'PowerShell',
  explorer: 'File Explorer',
};

// Error words in terminal/editor titles (feeds "debugging" drift analytics).
const ERROR_PATTERN =
  /\b(error|errors|exception|traceback|failed|failing|failure|panic|segfault|fatal|cannot find|undefined is not|npm ERR!|exit code [1-9])\b/i;

// "YouTube - Google Chrome" -> "YouTube"; also handles em-dash separators.
function stripBrowserSuffix(title) {
  const parts = title.split(/\s+[-\u2013\u2014]\s+/);
  if (parts.length < 2) return title;
  return parts.slice(0, -1).join(' - ').replace(/\u200b/g, '').trim();
}

function classify(raw) {
  const processName = (raw.process || '').trim();
  const key = processName.toLowerCase();
  const title = (raw.title || '').trim();

  // Desktop, lock screen, Alt-Tab switcher and similar title-less shells.
  if (!processName || raw.pid === 0 || (key === 'explorer' && !title)) {
    return { app: 'Desktop', process: processName, category: 'idle', label: 'Desktop', title };
  }

  // UWP apps all run inside ApplicationFrameHost; the title is the app.
  if (key === 'applicationframehost') {
    return { app: title || 'Windows App', process: processName, category: 'other', label: title, title };
  }

  const category = BY_PROCESS.get(key) ?? 'other';
  const app = FRIENDLY[key] || raw.description || processName;
  const label = category === 'browser' && title ? stripBrowserSuffix(title) : app;

  return {
    app,
    process: processName,
    category,
    label: label || app,
    title,
    errorSignal: (category === 'terminal' || category === 'editor') && ERROR_PATTERN.test(title),
  };
}

module.exports = { classify };
