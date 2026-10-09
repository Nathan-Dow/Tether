// Sprint sessions on disk: one JSON file per sprint in Tether's app-data
// folder. Window titles are personal, so nothing here ever leaves the machine
// and clear() wipes it all.
const fs = require('node:fs');
const path = require('node:path');

class SessionStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  fileFor(id) {
    return path.join(this.dir, `${id}.json`);
  }

  // Sync on purpose: files are small, and it must work inside will-quit.
  save(session) {
    const file = this.fileFor(session.id);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session));
    fs.renameSync(tmp, file);
  }

  load(id) {
    try {
      return JSON.parse(fs.readFileSync(this.fileFor(id), 'utf8'));
    } catch {
      return null;
    }
  }

  // All sessions, oldest first. Corrupt files are skipped, not fatal.
  list({ since = 0 } = {}) {
    let names = [];
    try {
      names = fs.readdirSync(this.dir).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    const sessions = [];
    for (const name of names) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
        if (s.startedAt >= since) sessions.push(s);
      } catch {
        // ignore unreadable file
      }
    }
    return sessions.sort((a, b) => a.startedAt - b.startedAt);
  }

  clear() {
    for (const name of fs.readdirSync(this.dir)) {
      if (name.endsWith('.json') || name.endsWith('.tmp')) fs.rmSync(path.join(this.dir, name));
    }
  }
}

module.exports = { SessionStore };
