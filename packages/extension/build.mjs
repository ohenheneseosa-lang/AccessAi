import * as esbuild from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const watch = process.argv.includes('--watch');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'icons'), { recursive: true });
await cp(join(root, 'static'), out, { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(join(out, 'icons', `${size}.png`), iconPng(size));

const common = {
  bundle: true,
  target: 'chrome116',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'info',
  legalComments: 'none',
};
const builds = [
  { ...common, entryPoints: { background: join(root, 'src/background.ts') }, outdir: out, format: 'esm' },
  { ...common, entryPoints: { content: join(root, 'src/content/index.ts') }, outdir: out, format: 'iife' },
  { ...common, entryPoints: { sidepanel: join(root, 'src/panel/main.tsx') }, outdir: out, format: 'esm' },
];
if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}

/** Draws the AccessAI mark (dark rounded square, white arc, blue dot) as a PNG. */
function iconPng(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.25;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(Math.max(x + 0.5, r), size - r), cy = Math.min(Math.max(y + 0.5, r), size - r);
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
      if (!inside) continue;
      let c = [17, 17, 17];
      const nx = (x + 0.5) / size, ny = (y + 0.5) / size;
      const d = Math.hypot(nx - 0.5, ny - 0.625);
      if (ny <= 0.625 && Math.abs(d - 0.25) < 0.045) c = [255, 255, 255];
      if (Math.hypot(nx - 0.5, ny - 0.6) < 0.085) c = [75, 99, 255];
      px.set([...c, 255], i);
    }
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function crc32(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; }
  return ~c;
}
