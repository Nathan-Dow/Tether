// Ambient Mode activity groups: every window falls into one coarse bucket of
// "what kind of work is this" - deterministic rules over the classifier's
// category and the window title, so it costs nothing to run every tick.

const GROUPS = {
  coding: 'Coding',
  research: 'Research / Docs',
  writing: 'Writing / Notes',
  design: 'Design',
  messaging: 'Messaging / Social',
  entertainment: 'Video / Entertainment',
  browsing: 'Browsing',
  other: 'Other apps',
  away: 'Away',
};

const has = (text, words) => words.some((w) => text.includes(w));

const SOCIAL = ['reddit', 'twitter', ' / x', 'x.com', 'facebook', 'instagram', 'tiktok', 'threads', 'linkedin',
  'messenger', 'discord', 'whatsapp', 'telegram', 'slack', 'teams', 'gmail', 'outlook', 'mail'];
const ENTERTAINMENT = ['youtube', 'netflix', 'twitch', 'disney+', 'prime video', 'hbo', 'crunchyroll', 'spotify',
  '9gag', 'pinterest', 'tumblr', 'steam', 'shopee', 'lazada', 'amazon', 'ebay'];
const RESEARCH = ['docs', 'documentation', 'stack overflow', 'stackoverflow', 'mdn', 'github', 'gitlab',
  'api reference', 'readme', 'npm', 'pypi', 'wikipedia', 'developer', 'tutorial', 'guide', 'reference',
  'claude', 'chatgpt', 'gemini', 'localhost', '127.0.0.1'];

function groupOf(seg) {
  const text = `${seg.app} ${seg.label} ${seg.title}`.toLowerCase();
  switch (seg.category) {
    case 'idle':
      return 'away';
    case 'editor':
    case 'terminal':
      return 'coding';
    case 'design':
      return 'design';
    case 'notes':
      return 'writing';
    case 'chat':
      return 'messaging';
    case 'media':
      return 'entertainment';
    case 'browser':
      // Video first: "Rust tutorial - YouTube" is still YouTube.
      if (has(text, ENTERTAINMENT)) return 'entertainment';
      if (has(text, SOCIAL)) return 'messaging';
      if (has(text, RESEARCH)) return 'research';
      return 'browsing';
    default:
      if (has(text, SOCIAL)) return 'messaging';
      if (has(text, ENTERTAINMENT)) return 'entertainment';
      return 'other';
  }
}

module.exports = { GROUPS, groupOf };
