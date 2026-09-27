// Daily reminder job (Vercel Cron, see vercel.json): on a day with a planned shift,
// everyone who switched reminders on gets "Heute arbeiten". Safe to call more than
// once a day — each person is notified at most once per day (lastSent).
import { list } from '@vercel/blob';
import { json, configured, readJson, readDoc, sanitize, writeJson, errorJson, viennaDay } from './_lib.js';
import { sendAll } from './push.js';

export function reminderText(plans) {
  const p = plans.slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))[0];
  const parts = ['Schicht in der bluegarage'];
  if (p.time) parts[0] += ` ab ${p.time} Uhr`;
  if (p.note) parts.push(p.note);
  return { title: 'Heute arbeiten', body: parts.join(' · '), tag: 'g-tracker-' + p.date, url: '/' };
}

export async function GET() {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const today = viennaDay();
    const { blobs } = await list({ prefix: 'gt/_push/', limit: 1000 });
    const result = { today, people: blobs.length, notified: 0 };
    for (const b of blobs) {
      const key = b.pathname.slice('gt/_push/'.length).replace(/\.json$/, '');
      const { doc: pushDoc } = await readJson(b.pathname);
      if (!pushDoc?.subs?.length || pushDoc.lastSent === today) continue;
      const { doc } = await readDoc(key);
      const plans = sanitize(doc?.entries).filter((e) => e.kind === 'plan' && e.date === today);
      if (!plans.length) continue;
      const r = await sendAll(pushDoc, reminderText(plans));
      await writeJson(b.pathname, { ...pushDoc, subs: r.subs, lastSent: today });
      if (r.sent) result.notified++;
    }
    return json(result);
  } catch (e) {
    return errorJson(e);
  }
}
