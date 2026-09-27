// Shared helpers for the G-Tracker API (files starting with "_" are not routes on Vercel).
import { get, put } from '@vercel/blob';
import { createHash } from 'node:crypto';

export const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const validId = (id) => typeof id === 'string' && /^[a-z0-9]{20,64}$/.test(id);
export const keyFor = (id) => createHash('sha256').update('g-tracker:' + id).digest('hex').slice(0, 40);
export const errorJson = (e) => json({ error: 'server', message: String(e?.message || e).slice(0, 300) }, 500);

/** Today's date in Austria as YYYY-MM-DD. */
export const viennaDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);

const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };

/** Keeps only well-formed shifts, planned shifts and deletion tombstones. */
export function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list.slice(0, 20000)) {
    if (!e || typeof e.id !== 'string' || e.id.length > 40) continue;
    const u = Number(e.u) || Number(e.created) || 0;
    if (e.del) { out.push({ id: e.id, del: true, u }); continue; }
    if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const note = typeof e.note === 'string' ? e.note.slice(0, 500) : '';
    const created = Number(e.created) || u;
    if (e.kind === 'plan') {
      const time = typeof e.time === 'string' && /^\d{2}:\d{2}$/.test(e.time) ? e.time : '';
      out.push({ id: e.id, kind: 'plan', date: e.date, time, note, created, u });
      continue;
    }
    out.push({
      id: e.id, date: e.date,
      amount: num(e.amount, 100000), tip: num(e.tip, 100000), hours: num(e.hours, 48),
      note, created, u,
    });
  }
  return out;
}

/** Per-id merge: the newer `u` wins, a tombstone wins a tie. */
export function merge(a = [], b = []) {
  const m = new Map();
  for (const e of [...a, ...b]) {
    if (!e || typeof e.id !== 'string') continue;
    const cur = m.get(e.id);
    if (!cur || (e.u || 0) > (cur.u || 0) || ((e.u || 0) === (cur.u || 0) && e.del && !cur.del)) m.set(e.id, e);
  }
  return [...m.values()];
}

/** Reads a JSON blob straight from storage (no CDN cache). */
export async function readJson(pathname) {
  const r = await get(pathname, { access: ACCESS, useCache: false });
  if (!r || r.statusCode !== 200) return { doc: null, etag: null };
  return { doc: await new Response(r.stream).json(), etag: r.blob.etag };
}
export const readDoc = (key) => readJson(`gt/${key}/data.json`);

export function writeJson(pathname, doc, extra = {}) {
  return put(pathname, JSON.stringify(doc), { access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, ...extra });
}
