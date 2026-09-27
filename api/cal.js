// Calendar subscription for the iPhone Calendar app (webcal://…/api/cal?k=<key>).
// Lists planned shifts and worked shifts. <key> is the one-way hash of the sync
// code (the same value that names the storage folder), so the link can show the
// calendar but can never be used to read or change the actual data.
import { json, configured, readDoc, sanitize, errorJson } from './_lib.js';

const LOCATION = 'bluegarage, Hinterleitenstraße 40, 8523 Frauental an der Laßnitz';
const DEFAULT_MINUTES = 5 * 60; // planned shifts without an end: assume 5 h

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad = (n) => String(n).padStart(2, '0');
const dstamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Floating local date-time (the phone shows it in its own time zone, i.e. Austria). */
function local(date, hm, addMinutes = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, Number(hm.slice(0, 2)), Number(hm.slice(3, 5)) + addMinutes));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
}
function dayAfter(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}
const minutes = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const eur = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' €';

/** Folds lines longer than 75 octets as RFC 5545 requires. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = []; let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(entries, now = new Date()) {
  const out = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//G-Tracker//bluegarage//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:bluegarage', 'X-WR-CALDESC:Schichten aus G-Tracker', 'X-WR-TIMEZONE:Europe/Vienna',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = dstamp(now);
  for (const e of sanitize(entries)) {
    if (e.del) continue;
    const ev = ['BEGIN:VEVENT', `UID:${e.id}@g-tracker`, `DTSTAMP:${stamp}`];
    if (e.kind === 'plan') {
      ev.push(`SUMMARY:${esc('Arbeiten · bluegarage')}`);
      if (e.time) {
        ev.push(`DTSTART:${local(e.date, e.time)}`, `DTEND:${local(e.date, e.time, DEFAULT_MINUTES)}`);
      } else {
        ev.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${dayAfter(e.date)}`);
      }
      if (e.note) ev.push(`DESCRIPTION:${esc(e.note)}`);
    } else {
      const total = (e.amount || 0) + (e.tip || 0);
      ev.push(`SUMMARY:${esc(`bluegarage · ${eur(total)}`)}`);
      if (e.start) {
        const len = e.end ? minutes(e.end) - minutes(e.start) + (minutes(e.end) <= minutes(e.start) ? 1440 : 0) : Math.round((e.hours || 5) * 60);
        ev.push(`DTSTART:${local(e.date, e.start)}`, `DTEND:${local(e.date, e.start, len)}`);
      } else {
        ev.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${dayAfter(e.date)}`, 'TRANSP:TRANSPARENT');
      }
      const lines = [`Verdienst ${eur(e.amount || 0)}`];
      if (e.tip) lines.push(`Trinkgeld ${eur(e.tip)}`);
      if (e.hours) lines.push(`${String(e.hours).replace('.', ',')} h`);
      if (e.note) lines.push(e.note);
      ev.push(`DESCRIPTION:${esc(lines.join('\n'))}`);
    }
    ev.push(`LOCATION:${esc(LOCATION)}`, 'END:VEVENT');
    out.push(...ev);
  }
  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n') + '\r\n';
}

export async function GET(request) {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const k = new URL(request.url).searchParams.get('k') || '';
    if (!/^[a-f0-9]{40}$/.test(k)) return json({ error: 'bad_key' }, 400);
    const { doc } = await readDoc(k);
    return new Response(buildIcs(doc?.entries || []), {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="bluegarage.ics"',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return errorJson(e);
  }
}
