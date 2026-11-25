// Captures the real AccessAI extension running the three promo journeys.
// Writes paired screenshots (site + panel) and a shots.json list for compose.py.
// Needs the demo sites (port 5173) and the API in demo mode (port 8787) running.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ext = fileURLToPath(new URL('../../packages/extension/dist', import.meta.url));
const OUT = process.argv[2] ?? fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const BASE = {
  name: '', uses: { screenReader: false, captions: false, largeText: false, plainEnglish: false, signLanguage: false },
  defaultTab: 'assistant', readAloud: false, speechRate: 1, readingLevel: 'simple', captionSize: 22,
  apiBase: 'http://127.0.0.1:8787', demoMode: false,
};

const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  viewport: { width: 1100, height: 760 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;

async function open(path, profile) {
  if (profile) await sw.evaluate((p) => chrome.storage.local.set({ profile: p, firstRun: false }), profile);
  const site = await ctx.newPage();
  await site.goto(`http://localhost:5173${path}`);
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, site.url());
  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 380, height: 760 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html?tab=${tabId}`);
  return { site, panel, tabId };
}
const ask = async (panel, text) => {
  await panel.getByLabel('Ask anything').fill(text);
  await panel.getByRole('button', { name: 'Send' }).click();
};

const shots = [];
let n = 0;
// Playwright screenshots ignore Chrome's tab zoom, so mirror the real zoom level with CSS zoom
// while the screenshot is taken. The extension itself still sets the zoom with chrome.tabs.setZoom.
let tabZoom = async () => 1;
async function shot(site, panel, caption, seconds = 4) {
  n += 1;
  const z = await tabZoom();
  if (z !== 1) await site.evaluate((z) => { document.documentElement.style.zoom = String(z); }, z);
  const s = `${OUT}${String(n).padStart(2, '0')}-site.png`;
  const p = `${OUT}${String(n).padStart(2, '0')}-panel.png`;
  await site.screenshot({ path: s });
  if (z !== 1) await site.evaluate(() => { document.documentElement.style.zoom = ''; });
  await panel.screenshot({ path: p });
  shots.push({ kind: 'shot', site: s, panel: p, caption, seconds });
}
const card = (title, sub, seconds = 3.5) => shots.push({ kind: 'card', title, sub, seconds });

// ---- Sam: Blind, uses a screen reader ----
card('Sam is Blind.', 'He uses a screen reader. Today he’s buying running shoes.');
{
  const { site, panel } = await open('/runner-shop/', { ...BASE, name: 'Sam', uses: { ...BASE.uses, screenReader: true }, readAloud: true });
  await panel.getByRole('heading', { name: 'Hi Sam,' }).waitFor();
  await shot(site, panel, 'AccessAI sits beside any website. Sam talks to it in plain words.');
  await panel.getByRole('button', { name: 'Summarise this page' }).click();
  await panel.getByText(/^This is Runner Shop, an online store/).first().waitFor();
  await shot(site, panel, '“What’s on this page?” AccessAI sums it up and reads it aloud.', 4.5);
  await ask(panel, 'What does delivery cost?');
  await panel.getByText(/Delivery is free on orders over \$100\. The Black Runner is \$129/).first().waitFor();
  await panel.getByRole('button', { name: 'Why?' }).last().click();
  await panel.getByText(/From the page:/).first().waitFor();
  await shot(site, panel, 'Answers come from the page itself, and Sam can ask why.', 4.5);
  await ask(panel, 'Add the black runners in size 10 to my cart');
  await site.getByRole('status').filter({ hasText: 'In your cart' }).waitFor();
  await panel.getByText('Done', { exact: true }).first().waitFor();
  await shot(site, panel, '“Add size 10 to my cart.” It does each step and tells him what changed.', 5);
  await ask(panel, 'Check out');
  await panel.getByText('Stopped', { exact: true }).first().waitFor();
  await shot(site, panel, 'At payment, AccessAI stops. Sam pays himself. It never touches card details.', 5.5);
  await site.close(); await panel.close();
}

// ---- Mia: Deaf ----
card('Mia is Deaf.', 'It’s her first day, and her welcome video has no captions.');
{
  const { site, panel } = await open('/harbour-health/', { ...BASE, name: 'Mia', uses: { ...BASE.uses, captions: true }, defaultTab: 'captions' });
  await panel.getByRole('button', { name: 'Start captions' }).waitFor();
  await shot(site, panel, 'AccessAI opens on Captions, because that’s what Mia chose.');
  await panel.getByRole('button', { name: 'Start captions' }).click();
  await site.getByRole('button', { name: 'Play video' }).click();
  await panel.locator('.caption-lines').getByText('Your start date is Monday the 2nd of December, at 9 am.').waitFor({ timeout: 20_000 });
  await shot(site, panel, 'Live captions appear in large, clear text as the video plays.', 5);
  await panel.locator('.caption-lines').getByText(/Before Friday, please complete the online induction module/).waitFor({ timeout: 25_000 });
  await panel.getByRole('button', { name: 'Stop captions' }).click();
  await panel.getByLabel('Search the transcript').fill('start date');
  await panel.locator('mark', { hasText: 'start date' }).first().waitFor();
  await shot(site, panel, 'Later, she searches the transcript for her start date.');
  await panel.getByLabel('Search the transcript').fill('');
  await panel.getByRole('button', { name: 'Summary of dates and actions' }).click();
  await panel.locator('.caption-lines .summary').waitFor();
  await panel.locator('.caption-lines .summary').scrollIntoViewIfNeeded();
  await shot(site, panel, 'One tap gives her the dates and things to do.', 4.5);
  await site.close(); await panel.close();
}

// ---- Grace: low vision ----
card('Grace has low vision.', 'She’s reading about the Seniors Card. The text is tiny and pale.');
{
  const { site, panel, tabId } = await open('/seniors-card/', { ...BASE, name: 'Grace' });
  tabZoom = () => sw.evaluate((id) => chrome.tabs.getZoom(id), tabId);
  await panel.getByRole('heading', { name: 'Hi Grace,' }).waitFor();
  await shot(site, panel, 'The page as it comes: small, pale grey text.');
  await ask(panel, 'Make the text bigger');
  await panel.getByText('The page is now at 125%.').first().waitFor();
  await ask(panel, 'Make it bigger');
  await panel.getByText('The page is now at 150%.').first().waitFor();
  await shot(site, panel, '“Make it bigger.” The whole page grows.');
  await ask(panel, 'High contrast');
  await panel.getByText(/High contrast is on/).first().waitFor();
  await ask(panel, 'Turn on the reading guide');
  await site.locator('#accessai-reading-guide').waitFor({ state: 'attached' });
  await site.mouse.move(300, 330);
  await shot(site, panel, 'High contrast: white on black, links in yellow, and a reading guide.', 5);
  await ask(panel, 'Explain this in plain English');
  await panel.getByText(/You can get a Seniors Card if you are 60 or older/).first().waitFor();
  await shot(site, panel, '“Explain this in plain English.” Short, simple sentences.', 5);
  await ask(panel, 'reset the page');
  await panel.getByText('The page is back to how it was.').first().waitFor();
  await shot(site, panel, '“Reset the page” puts everything back.', 3.5);
  await site.close(); await panel.close();
}

card('AccessAI', 'The web, on your terms.', 4);
writeFileSync(`${OUT}shots.json`, JSON.stringify(shots, null, 2));
await ctx.close();
console.log(`captured ${n} shots to ${OUT}`);
