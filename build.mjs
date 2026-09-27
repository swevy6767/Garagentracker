// Build: copies the static app and its icons into ./public (no dependencies).
import { mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';

const OUT = 'public';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT + '/icons', { recursive: true });
for (const f of ['index.html', 'sw.js', 'manifest.webmanifest']) copyFileSync(f, `${OUT}/${f}`);
const icons = readdirSync('icons').filter((f) => f.endsWith('.png'));
for (const f of icons) copyFileSync(`icons/${f}`, `${OUT}/icons/${f}`);
console.log('Built app +', icons.length, 'icons into', OUT);
