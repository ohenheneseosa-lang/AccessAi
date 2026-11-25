// Renders the illustrated characters in characters.html to transparent PNGs.
// Usage: node render-characters.mjs <out_dir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = process.argv[2] ?? fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(new URL('./characters.html', import.meta.url).href);
for (const id of ['sam', 'mia', 'grace']) {
  await page.locator(`#${id}`).screenshot({ path: `${OUT}char-${id}.png`, omitBackground: true });
}
await browser.close();
console.log('rendered characters to', OUT);
