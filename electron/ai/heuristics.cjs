// Deterministic fallback used whenever Ollama is offline, slow, or returns
// something unusable. Same output shape as the model's verdict.

const TIME_SINKS = [
  'youtube', 'reddit', 'twitter', ' / x', 'x.com', 'facebook', 'instagram', 'tiktok', 'netflix',
  'twitch', 'disney+', 'prime video', 'hbo', '9gag', 'pinterest', 'tumblr', 'threads',
  'shopee', 'lazada', 'amazon', 'ebay', 'steam', 'messenger', 'discord', 'whatsapp', 'telegram',
  'spotify', 'crunchyroll', 'linkedin feed',
];

const DOC_HINTS = ['docs', 'documentation', 'stack overflow', 'stackoverflow', 'mdn', 'github',
  'api reference', 'readme', 'npm', 'pypi'];

function mentions(goal, text) {
  return goal && text && goal.toLowerCase().includes(text.trim().toLowerCase());
}

function heuristicVerdict({ goal, current }) {
  const label = current.label || current.app;
  const haystack = `${current.app} ${current.label} ${current.title}`.toLowerCase();
  const sink = TIME_SINKS.find((s) => haystack.includes(s));
  const backTo = `Back to "${goal}".`;

  const aligned = (confidence, reason) => ({
    isDistracted: false,
    confidence,
    distractingApp: '',
    reason,
    nudge: '',
    driftType: 'none',
  });

  if (current.category === 'idle') return aligned(0.5, 'Away from any app.');
  if (current.category === 'editor' || current.category === 'terminal') {
    return aligned(0.75, 'Working in a development tool.');
  }

  const isSink = sink || current.category === 'chat' || current.category === 'media';
  if (isSink && !mentions(goal, sink || current.app)) {
    // Messaging and media both count as a "social leak".
    return {
      isDistracted: true,
      confidence: 0.8,
      distractingApp: label,
      reason: `${label} is a common time sink unrelated to the goal.`,
      nudge: backTo,
      driftType: 'social',
    };
  }

  if (DOC_HINTS.some((d) => haystack.includes(d))) {
    return aligned(0.6, 'Looks like reference material.');
  }

  // Unknown app/page: don't accuse without evidence.
  return aligned(0.5, 'No strong signal either way.');
}

module.exports = { heuristicVerdict };
