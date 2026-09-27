// Reminder jobs (Vercel Cron, see vercel.json).
//
// Each slot is scheduled twice (summer and winter time) and only sends when it
// is actually the target hour in Austria: morning 9:xx, evening 23:xx.
// Everyone is notified at most once per slot and day (lastSent / lastEvening).
import { list } from '@vercel/blob';
import { json, configured, readJson, readDoc, sanitize, writeJson, errorJson, viennaDay, viennaHour, viennaHM } from './_lib.js';
import { sendAll } from './push.js';
import { morningMessage, eveningMessage } from './_messages.js';

const SLOTS = {
  morning: { hour: 9, field: 'lastSent' },
  evening: { hour: 23, field: 'lastEvening' },
};
const byStart = (a, b) => (a.time || '99').localeCompare(b.time || '99');

export async function runSlot(slot, { force = false, now = new Date() } = {}) {
  const cfg = SLOTS[slot];
  const today = viennaDay(now), hour = viennaHour(now);
  if (!force && hour !== cfg.hour) return { slot, today, skipped: `local hour is ${hour}` };
  const { blobs } = await list({ prefix: 'gt/_push/', limit: 1000 });
  const result = { slot, today, people: blobs.length, notified: 0 };
  for (const b of blobs) {
    const key = b.pathname.slice('gt/_push/'.length).replace(/\.json$/, '');
    const { doc: pushDoc } = await readJson(b.pathname);
    if (!pushDoc?.subs?.length || pushDoc[cfg.field] === today) continue;
    const { doc } = await readDoc(key);
    // a plan disappears once its earnings are entered, so evening only asks about open shifts
    const plans = sanitize(doc?.entries).filter((e) => e.kind === 'plan' && e.date === today).sort(byStart);
    if (!plans.length) continue;
    const first = plans[0];
    // if the shift was started by hand, that is its real start time
    const p = { ...first, time: first.startedAt ? viennaHM(new Date(first.startedAt)) : first.time };
    const msg = slot === 'morning' ? morningMessage(p, today) : eveningMessage(p, today, p.endedAt ? viennaHM(new Date(p.endedAt)) : '');
    const r = await sendAll(pushDoc, msg);
    await writeJson(b.pathname, { ...pushDoc, subs: r.subs, [cfg.field]: today });
    if (r.sent) result.notified++;
  }
  return result;
}

export async function handle(request, slot) {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const force = new URL(request.url).searchParams.get('force') === '1';
    return json(await runSlot(slot, { force }));
  } catch (e) {
    return errorJson(e);
  }
}

export const GET = (request) => handle(request, 'morning');
