// Your own labels: mark a site or app as always on-task or always drift. They
// win over the model - in the live evaluator and in every report, past
// sprints included - and live in one small JSON file next to the history.
const fs = require('node:fs');

const LABELS = ['focus', 'drift'];

class LabelStore {
  constructor(file) {
    this.file = file;
    this.labels = {};
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [site, label] of Object.entries(data.labels || {})) {
        if (LABELS.includes(label)) this.labels[site] = label;
      }
    } catch {
      // no labels yet (or an unreadable file): start empty
    }
  }

  all() {
    return { ...this.labels };
  }

  // label: 'focus' | 'drift', or null to hand the site back to the AI.
  set(site, label) {
    if (!site || typeof site !== 'string') return this.all();
    if (LABELS.includes(label)) this.labels[site] = label;
    else delete this.labels[site];
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, labels: this.labels }, null, 2));
    fs.renameSync(tmp, this.file);
    return this.all();
  }
}

// The verdict a label stands for, in the evaluator's verdict shape.
function labelVerdict(site, label, driftType = 'social') {
  const drift = label === 'drift';
  return {
    isDistracted: drift,
    confidence: 1,
    distractingApp: drift ? site : '',
    reason: `You labelled ${site} as always ${drift ? 'drift' : 'on-task'}.`,
    nudge: drift ? `Leave ${site} and get back to your goal.` : '',
    driftType: drift ? driftType : 'none',
    source: 'you',
  };
}

module.exports = { LabelStore, labelVerdict, LABELS };
