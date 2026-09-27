// G-Tracker push notifications.
//
// GET  /api/push?key=1                                   -> { publicKey }   (VAPID key, created once and kept in the private store)
// POST /api/push { id, action: 'subscribe', subscription } -> { ok }
// POST /api/push { id, action: 'unsubscribe', endpoint }   -> { ok }
// POST /api/push { id, action: 'test' }                    -> { ok, sent }
//
// Subscriptions live in gt/_push/<sha256(code)>.json so the daily reminder job
// (api/remind.js) only has to look at people who switched reminders on.
import webpush from 'web-push';
import { put } from '@vercel/blob';
import { ACCESS, json, configured, validId, keyFor, readJson, writeJson, errorJson } from './_lib.js';

const VAPID_PATH = 'gt/_config/vapid.json';
const SUBJECT = 'https://garagentracker-pi.vercel.app';

export async function getVapid() {
  let { doc } = await readJson(VAPID_PATH);
  if (doc?.publicKey && doc?.privateKey) return doc;
  const keys = webpush.generateVAPIDKeys();
  try {
    // no overwrite: if two requests race, the first key pair wins and both read it back
    await put(VAPID_PATH, JSON.stringify(keys), { access: ACCESS, contentType: 'application/json', addRandomSuffix: false });
    return keys;
  } catch {
    ({ doc } = await readJson(VAPID_PATH));
    if (doc?.publicKey) return doc;
    throw new Error('vapid_unavailable');
  }
}

export const pushPath = (key) => `gt/_push/${key}.json`;

function validSub(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1200
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string'
    && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
}

/** Sends one notification to every subscription in `doc`, drops the ones the push service says are gone. */
export async function sendAll(doc, payload) {
  const vapid = await getVapid();
  let sent = 0;
  const keep = [];
  for (const sub of doc.subs || []) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: 6 * 3600, urgency: 'high',
        vapidDetails: { subject: SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      });
      sent++; keep.push(sub);
    } catch (e) {
      if (e?.statusCode !== 404 && e?.statusCode !== 410) keep.push(sub); // keep on temporary errors
    }
  }
  return { sent, subs: keep };
}

export async function GET(request) {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    const url = new URL(request.url);
    if (url.searchParams.get('key')) return json({ publicKey: (await getVapid()).publicKey });
    return json({ error: 'bad_request' }, 400);
  } catch (e) {
    return errorJson(e);
  }
}

export async function POST(request) {
  try {
    if (!configured()) return json({ error: 'not_configured' }, 503);
    let body;
    try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad_json' }, 400); }
    if (!validId(body?.id)) return json({ error: 'bad_id' }, 400);
    const path = pushPath(keyFor(body.id));
    const { doc } = await readJson(path);
    const cur = { subs: [], lastSent: null, ...(doc || {}) };

    if (body.action === 'subscribe') {
      if (!validSub(body.subscription)) return json({ error: 'bad_subscription' }, 400);
      const s = { endpoint: body.subscription.endpoint, keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth } };
      cur.subs = [s, ...cur.subs.filter((x) => x.endpoint !== s.endpoint)].slice(0, 5);
      await writeJson(path, cur);
      return json({ ok: true, devices: cur.subs.length });
    }
    if (body.action === 'unsubscribe') {
      cur.subs = cur.subs.filter((x) => x.endpoint !== body.endpoint);
      await writeJson(path, cur);
      return json({ ok: true, devices: cur.subs.length });
    }
    if (body.action === 'test') {
      if (!cur.subs.length) return json({ ok: false, error: 'no_devices' }, 404);
      const r = await sendAll(cur, { title: 'G-Tracker', body: 'Passt – die Erinnerungen funktionieren.', tag: 'g-tracker-test' });
      if (r.subs.length !== cur.subs.length) { cur.subs = r.subs; await writeJson(path, cur); }
      return json({ ok: r.sent > 0, sent: r.sent });
    }
    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    return errorJson(e);
  }
}
