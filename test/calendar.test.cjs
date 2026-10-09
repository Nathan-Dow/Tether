const test = require('node:test');
const assert = require('node:assert/strict');

const { googleCalendarUrl, icsFile, icsFileName, escapeText, fold, utcStamp } = require('../electron/analytics/calendar.cjs');
const { sessionReport } = require('../electron/analytics/metrics.cjs');
const { buildSession } = require('../electron/analytics/demoDay.cjs');

const START = Date.UTC(2026, 9, 10, 1, 0, 0);
const report = sessionReport(
  buildSession({
    id: '2026-10-10_090000',
    goal: 'Finish the auth refactor; then, ship it',
    start: START,
    durationMin: 30,
    phases: [['work', 20], ['drift', 5, 0], ['work', 5]],
    seed: 9,
  }),
);

test('utcStamp formats basic UTC date-time', () => {
  assert.equal(utcStamp(START), '20261010T010000Z');
});

test('Google Calendar URL carries title, UTC dates and stats', () => {
  const url = new URL(googleCalendarUrl(report));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Focus sprint: Finish the auth refactor; then, ship it');
  assert.equal(url.searchParams.get('dates'), '20261010T010000Z/20261010T013000Z');
  const details = url.searchParams.get('details');
  assert.match(details, /Deep flow: \d+m/);
  assert.match(details, /Top leaks: YouTube 5m/);
});

test('ics escapes text per RFC 5545', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('ics folds long lines at 75 octets without splitting UTF-8', () => {
  const long = `DESCRIPTION:${'é'.repeat(80)}`; // 2 bytes each
  const folded = fold(long).split('\r\n');
  assert.ok(folded.length > 1);
  for (const l of folded) assert.ok(Buffer.byteLength(l, 'utf8') <= 75, l);
  assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(''), long);
});

test('ics file is a valid single-event calendar with CRLF endings', () => {
  const ics = icsFile(report, { now: START });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF found');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /\r\nDTSTART:20261010T010000Z\r\n/);
  assert.match(unfolded, /\r\nDTEND:20261010T013000Z\r\n/);
  assert.match(unfolded, /\r\nSUMMARY:Focus sprint: Finish the auth refactor\\; then\\, ship it\r\n/);
  assert.match(unfolded, /\r\nUID:2026-10-10_090000@tether\.local\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('ics file name is a safe slug', () => {
  assert.equal(icsFileName(report), 'tether-2026-10-10_090000-finish-the-auth-refactor-then-ship-it.ics');
});
