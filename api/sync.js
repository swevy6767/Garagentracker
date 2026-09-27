// G-Tracker cloud sync — stores each user's shifts (and planned shifts) in a private Vercel Blob store.
//
// GET  /api/sync              header x-sync-id: <code>  -> { entries, updatedAt }
// POST /api/sync              body { id, entries }       -> merged { entries, updatedAt }
// GET  /api/sync?selftest=1                              -> { ok, configured }
//
// The sync code never appears in a blob path: data lives under gt/<sha256(code)>/.
// Entries are merged per id (newest `u` wins, deletions are tombstones), so a
// device can never wipe out shifts that another device added. A dated backup
// copy is written once per day and the newest 30 are kept.
import { list, del } from '@vercel/blob';
import { ACCESS, json, configured, validId, keyFor, sanitize, merge, readDoc, writeJson, errorJson } from './_lib.js';

export { sanitize, merge };
const MAX_BYTES = 2_000_000;
const KEEP_BACKUPS = 30;

async function writeBackup(key, doc, day) {
  await writeJson(`gt/${key}/backup/${day}.json`, doc);
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
      await writeJson(`gt/${key}/data.json`, next, etag ? { ifMatch: etag } : {});
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
    return errorJson(e);
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
    return errorJson(e);
  }
}
