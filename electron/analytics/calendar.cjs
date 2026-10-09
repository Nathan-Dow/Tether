// Zero-dependency calendar export for a finished sprint:
//   - a Google Calendar "create event" template URL
//   - an RFC 5545 .ics file for Apple Calendar / Outlook
// Input is a sessionReport() from metrics.cjs.

const MIN = 60_000;
const GOOGLE_BASE = 'https://calendar.google.com/calendar/render';

const mins = (ms) => `${Math.round(ms / MIN)}m`;

// 2026-10-10T01:05:41.123Z -> 20261010T010541Z
function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function title(report) {
  return `Focus sprint: ${report.goal}`;
}

function description(report) {
  const t = report.totals;
  const lines = [
    `Goal: ${report.goal}`,
    `Deep flow: ${mins(report.deepWorkMs)} | On task: ${mins(t.onTaskMs)} | Drift: ${mins(t.driftMs)}`,
  ];
  const scores = [];
  if (report.flowScore != null) scores.push(`Flow score ${report.flowScore}/100`);
  if (report.cfi != null) scores.push(`Fragmentation index ${report.cfi}/100`);
  if (report.switchesPerHour != null) scores.push(`${report.switchesPerHour} switches/h`);
  if (scores.length) lines.push(scores.join(' | '));
  if (report.leaderboard.length) {
    lines.push(`Top leaks: ${report.leaderboard.slice(0, 3).map((l) => `${l.site} ${mins(l.ms)}`).join(', ')}`);
  }
  lines.push('', 'Recorded on-device by Tether. No activity data left this machine.');
  return lines.join('\n');
}

function googleCalendarUrl(report) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(report),
    dates: `${utcStamp(report.startedAt)}/${utcStamp(report.endedAt)}`,
    details: description(report),
  });
  return `${GOOGLE_BASE}?${params}`;
}

// RFC 5545 3.3.11: escape backslash, semicolon, comma, and newlines.
function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 3.1: lines longer than 75 octets are folded with CRLF + space,
// never splitting a multi-byte UTF-8 character.
function fold(line) {
  const out = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function icsFile(report, { now = Date.now() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tether//Focus Sprint//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${report.id}@tether.local`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(report.startedAt)}`,
    `DTEND:${utcStamp(report.endedAt)}`,
    `SUMMARY:${escapeText(title(report))}`,
    `DESCRIPTION:${escapeText(description(report))}`,
    'CATEGORIES:Focus',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function icsFileName(report) {
  const slug = report.goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `tether-${report.id}${slug ? `-${slug}` : ''}.ics`;
}

module.exports = { googleCalendarUrl, icsFile, icsFileName, escapeText, fold, utcStamp };
