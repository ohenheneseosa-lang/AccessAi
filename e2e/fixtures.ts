import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const extensionPath = fileURLToPath(new URL('../packages/extension/dist', import.meta.url));
export const SHOTS = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

type Fixtures = {
  context: BrowserContext;
  sw: Worker;
  /** Opens a demo page and the AccessAI panel pinned to it. */
  open: (path: string, profile?: Record<string, unknown>) => Promise<{ site: Page; panel: Page; tabId: number }>;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Lets CI or a pre-installed browser be used: CHROMIUM_PATH=/path/to/chrome
      executablePath: process.env.CHROMIUM_PATH || undefined,
      viewport: { width: 1100, height: 760 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  open: async ({ context, sw }, use) => {
    const id = new URL(sw.url()).host;
    await use(async (path, profile) => {
      if (profile) await sw.evaluate((p) => chrome.storage.local.set({ profile: p, firstRun: false }), profile);
      const site = await context.newPage();
      await site.goto(`http://localhost:5173${path}`);
      const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, site.url());
      const panel = await context.newPage();
      await panel.setViewportSize({ width: 380, height: 760 });
      await panel.goto(`chrome-extension://${id}/sidepanel.html?tab=${tabId}`);
      return { site, panel, tabId };
    });
  },
});
export { expect } from '@playwright/test';

export const BASE_PROFILE = {
  name: '',
  uses: { screenReader: false, captions: false, largeText: false, plainEnglish: false, signLanguage: false },
  defaultTab: 'assistant',
  readAloud: false,
  speechRate: 1,
  readingLevel: 'simple',
  captionSize: 22,
  apiBase: 'http://127.0.0.1:8787',
  demoMode: false,
};

/** Type a message into the Assistant and send it. */
export async function ask(panel: Page, text: string) {
  await panel.getByLabel('Ask anything').fill(text);
  await panel.getByRole('button', { name: 'Send' }).click();
}
