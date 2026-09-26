// G-Tracker cloud sync — stores each user's shifts in a private Vercel Blob store.
//
// GET  /api/sync              header x-sync-id: <code>  -> { entries, updatedAt }
// POST /api/sync              body { id, entries }       -> merged { entries, updatedAt }
// GET  /api/sync?selftest=1                              -> { ok, configured }
//
// The sync code never appears in a blob path: data lives under gt/<sha256(code)>/.
// Entries are merged per id (newest `u` wins, deletions are tombstones), so a
// device can never wipe out shifts that another device added. A dated backup
// copy is written once per day and the newest 30 are kept.
import { get, put, list, del } from '@vercel/blob';
import { createHash } from 'node:crypto';

const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const MAX_BYTES = 2_000_000;
const KEEP_BACKUPS = 30;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const validId = (id) => typeof id === 'string' && /^[a-z0-9]{20,64}$/.test(id);
const keyFor = (id) => createHash('sha256').update('g-tracker:' + id).digest('hex').slice(0, 40);

const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };
export function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list.slice(0, 20000)) {
    if (!e || typeof e.id !== 'string' || e.id.length > 40) continue;
    const u = Number(e.u) || Number(e.created) || 0;
    if (e.del) { out.push({ id: e.id, del: true, u }); continue; }
    if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    out.push({
      id: e.id, date: e.date,
      amount: num(e.amount, 100000), tip: num(e.tip, 100000), hours: num(e.hours, 48),
      note: typeof e.note === 'string' ? e.note.slice(0, 500) : '',
      created: Number(e.created) || u, u,
    });
  }
  return out;
}
export function merge(a = [], b = []) {
  const m = new Map();
  for (const e of [...a, ...b]) {
    if (!e || typeof e.id !== 'string') continue;
    const cur = m.get(e.id);
    if (!cur || (e.u || 0) > (cur.u || 0) || ((e.u || 0) === (cur.u || 0) && e.del && !cur.del)) m.set(e.id, e);
  }
  return [...m.values()];
}

async function readDoc(key) {
  const r = await get(`gt/${key}/data.json`, { access: ACCESS, useCache: false });
  if (!r || r.statusCode !== 200) return { doc: null, etag: null };
  return { doc: await new Response(r.stream).json(), etag: r.blob.etag };
}

async function writeBackup(key, doc, day) {
  const opts = { access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true };
  await put(`gt/${key}/backup/${day}.json`, JSON.stringify(doc), opts);
  const { blobs } = await list({ prefix: `gt/${key}/backup/`, limit: 1000 });
  const old = blobs.map((b) => b.pathname).sort().reverse().slice(KEEP_BACKUPS);
  if (old.length) await del(old);
}

async function mergeAndWrite(key, incoming) {
  const day = new Date().toISOString().slice(0, 10);
  for (let attempt = 0; ; attempt++) {
    const { doc, etag } = await readDoc(key);
    const entries = merge(sanitize(doc?.entries), incoming);
    const needBackup = doc?.lastBackup !== day && entries.length > 0;
    const next = { v: 2, entries, updatedAt: Date.now(), lastBackup: needBackup ? day : (doc?.lastBackup || null) };
    try {
      await put(`gt/${key}/data.json`, JSON.stringify(next), {
        access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
        ...(etag ? { ifMatch: etag } : {}),
      });
    } catch (e) {
      if (attempt < 3) continue; // someone else wrote in between: re-read, merge again
      throw e;
    }
    if (needBackup) { try { await writeBackup(key, next, day); } catch { /* backup is best effort */ } }
    return { entries, updatedAt: next.updatedAt };
  }
}

// Runs the real sync path twice (create, then overwrite with ifMatch) on a throwaway key.
async function selftest() {
  if (!configured()) return json({ ok: false, configured: false }, 503);
  const key = `_selftest_${Date.now()}`;
  const mk = (id, u) => ({ id, date: '2026-01-01', amount: 1, tip: 0, hours: 0, note: '', created: u, u });
  const steps = {};
  try {
    steps.first = (await mergeAndWrite(key, [mk('t1', 1)])).entries.length === 1;
    steps.second = (await mergeAndWrite(key, [mk('t2', 2)])).entries.length === 2;
    const { doc } = await readDoc(key);
    steps.readBack = doc?.entries?.length === 2;
    const { blobs } = await list({ prefix: `gt/${key}/` });
    steps.backup = blobs.some((b) => b.pathname.includes('/backup/'));
  } finally {
    const { blobs } = await list({ prefix: `gt/${key}/` });
    if (blobs.length) await del(blobs.map((b) => b.pathname));
  }
  return json({ ok: Object.values(steps).every(Boolean), steps, configured: true, access: ACCESS });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('selftest') === '1') return await selftest();
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const id = request.headers.get('x-sync-id');
    if (!validId(id)) return json({ error: 'bad_id' }, 400);
    const { doc } = await readDoc(keyFor(id));
    return json({ entries: doc?.entries || [], updatedAt: doc?.updatedAt || 0 });
  } catch (e) {
    return json({ error: 'server', message: String(e?.message || e).slice(0, 300) }, 500);
  }
}

export async function POST(request) {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    if (!validId(body?.id)) return json({ error: 'bad_id' }, 400);
    return json(await mergeAndWrite(keyFor(body.id), sanitize(body.entries)));
  } catch (e) {
    return json({ error: 'server', message: String(e?.message || e).slice(0, 300) }, 500);
  }
}
