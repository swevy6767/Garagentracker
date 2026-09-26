// Build: copies the static app into ./public and renders the PNG app icons.
// No dependencies - the icon is drawn with signed distances and encoded as PNG by hand.
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = 'public';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT + '/icons', { recursive: true });
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) copyFileSync(f, OUT + '/' + f);

// ---- PNG encoder ----
const T = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, rgb) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; rgb.copy(raw, y * row + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Icon geometry (1024 design units): rounded "B" monogram ----
const DX = -19, HW = 42; // horizontal offset, stroke half-width
const segs = [
  [392, 296, 392, 728],                      // stem
  [392, 296, 540, 296], [392, 500, 540, 500], // top bowl
  [392, 500, 556, 500], [392, 728, 556, 728], // bottom bowl
].map(([a, b, c, d]) => [a + DX, b, c + DX, d]);
const arcs = [{ cx: 540 + DX, cy: 398, r: 102 }, { cx: 556 + DX, cy: 614, r: 114 }]; // right half-circles

function segDist(px, py, [ax, ay, bx, by]) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function arcDist(px, py, { cx, cy, r }) {
  if (px >= cx) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  return Math.min(Math.hypot(px - cx, py - (cy - r)), Math.hypot(px - cx, py - (cy + r)));
}
const top = [52, 132, 255], bot = [8, 62, 196]; // blue gradient
function render(size) {
  const s = size / 1024, buf = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / s, v = (y + 0.5) / s;
      const g = Math.min(1, Math.max(0, (u * 0.35 + v) / 1360));
      let d = Infinity;
      for (const a of arcs) d = Math.min(d, arcDist(u, v, a));
      for (const sg of segs) d = Math.min(d, segDist(u, v, sg));
      const a = Math.max(0, Math.min(1, (HW - d) * s + 0.5));
      const i = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) {
        const bg = top[k] + (bot[k] - top[k]) * g;
        buf[i + k] = Math.round(bg + (255 - bg) * a);
      }
    }
  }
  return png(size, size, buf);
}

const out = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'favicon-32.png': 32 };
for (const [name, size] of Object.entries(out)) writeFileSync(`${OUT}/icons/${name}`, render(size));
console.log('Built', Object.keys(out).length, 'icons into', OUT);
