// Background context daemon: samples the foreground window on a fixed tick,
// keeps a short history and per-app dwell time, and emits 'update' events.
//
// Sampling is cheap (~ms via the persistent probe), so it runs every couple of
// seconds for accurate dwell numbers; the expensive LLM evaluation (Phase 3)
// reads getState() on its own slower 8-10s cadence.
const { EventEmitter } = require('node:events');
const { classify } = require('./classify.cjs');

class ContextDaemon extends EventEmitter {
  constructor({ probe, intervalMs = 2000, appsEveryMs = 15_000, historySize = 30, selfPid = null }) {
    super();
    this.probe = probe;
    this.intervalMs = intervalMs;
    this.appsEveryMs = appsEveryMs;
    this.historySize = historySize;
    this.selfPid = selfPid;

    this.timer = null;
    this.busy = false;
    this.current = null; // latest classified snapshot (+ since)
    this.lastSampleAt = null;
    this.history = []; // one entry per focus change
    this.dwell = new Map(); // app -> ms in focus
    this.openWindows = [];
    this.lastAppsAt = 0;
    this.consecutiveFailures = 0;
  }

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  // Sample faster during a sprint, slower between them.
  setIntervalMs(ms) {
    if (ms === this.intervalMs) return;
    this.intervalMs = ms;
    if (!this.timer) return;
    clearInterval(this.timer);
    this.tick(); // fresh sample right away, e.g. when a sprint starts
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.probe.stop();
  }

  async tick() {
    // A slow sample must never stack up behind another one.
    if (this.busy) return;
    this.busy = true;
    try {
      const wantApps = Date.now() - this.lastAppsAt >= this.appsEveryMs;
      const raw = await this.probe.probe({ apps: wantApps });
      if (!raw.ok) throw new Error(raw.error || 'probe failed');

      if (wantApps && Array.isArray(raw.windows)) {
        this.lastAppsAt = Date.now();
        this.openWindows = raw.windows
          .filter((w) => w.pid !== this.selfPid)
          .map((w) => classify(w))
          .filter((w) => w.category !== 'idle');
      }

      this.consecutiveFailures = 0;

      // Looking at the island itself isn't a context switch.
      if (raw.pid === this.selfPid) return;
      this.record(classify(raw), Date.now());
    } catch (err) {
      this.consecutiveFailures += 1;
      this.emit('probe-error', err, this.consecutiveFailures);
    } finally {
      this.busy = false;
    }
  }

  record(snap, now) {
    if (this.current && this.lastSampleAt) {
      const app = this.current.app;
      this.dwell.set(app, (this.dwell.get(app) || 0) + (now - this.lastSampleAt));
    }
    this.lastSampleAt = now;

    const changed =
      !this.current || this.current.app !== snap.app || this.current.title !== snap.title;

    if (changed) {
      this.current = { ...snap, since: now };
      this.history.push(this.current);
      if (this.history.length > this.historySize) this.history.shift();
    } else {
      this.current = { ...snap, since: this.current.since };
    }

    this.emit('update', this.getState(), changed);
  }

  getState() {
    const now = Date.now();
    return {
      current: this.current,
      focusedForMs: this.current ? now - this.current.since : 0,
      recent: this.history.slice(-8),
      dwell: Object.fromEntries(this.dwell),
      openWindows: this.openWindows,
      healthy: this.consecutiveFailures === 0,
      at: now,
    };
  }
}

module.exports = { ContextDaemon };
