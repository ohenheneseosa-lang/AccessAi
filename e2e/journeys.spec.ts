import AxeBuilder from '@axe-core/playwright';
import { BASE_PROFILE, SHOTS, ask, expect, test } from './fixtures';

test('Sam (screen reader) shops for running shoes and AccessAI stops at payment', async ({ open, sw }) => {
  const { site, panel, tabId } = await open('/runner-shop/');

  // First run: preferences, not diagnoses.
  await expect(panel.getByRole('heading', { name: 'Welcome to AccessAI' })).toBeVisible();
  await panel.getByLabel('What should I call you? (optional)').fill('Sam');
  await panel.getByLabel(/I use a screen reader/).check();
  await panel.getByRole('button', { name: 'Start' }).click();
  await expect(panel.getByRole('heading', { name: 'Hi Sam,' })).toBeVisible();
  await expect(panel.getByText('Black Runner · Runner Shop · localhost')).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}sam-1-home.png` });

  await panel.getByRole('button', { name: 'Summarise this page' }).click();
  await expect(panel.getByText(/^This is Runner Shop, an online store/)).toBeVisible();

  await ask(panel, 'What does delivery cost?');
  await expect(panel.getByText(/Delivery is free on orders over \$100\. The Black Runner is \$129/)).toBeVisible();
  // "Why did it say that?" shows the page text behind the answer.
  await panel.getByRole('button', { name: 'Why?' }).last().click();
  await expect(panel.getByText('From the page: “Free delivery on orders over $100”')).toBeVisible();

  await panel.getByRole('button', { name: 'Describe the images' }).click();
  await expect(panel.getByText(/A black running shoe shown from the side/)).toBeVisible();
  await expect(panel.getByText('AI description')).toBeVisible();

  await ask(panel, 'Add the black runners in size 10 to my cart');
  await expect(panel.getByText('Done', { exact: true })).toBeVisible();
  await expect(panel.getByText('Choose "10" in "Size" (selected: Choose a size)')).toBeVisible();
  await expect(site.locator('#size')).toHaveValue('10');
  await expect(site.getByRole('status')).toHaveText('In your cart: Black Runner, size 10');
  await expect(panel.locator('.log').getByText(/The page now says: “In your cart: Black Runner, size 10”/)).toBeVisible();

  await ask(panel, 'Check out');
  await expect(panel.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(panel.getByText('This step involves payment. Please do it yourself. The next step is: Press "Checkout and pay".')).toBeVisible();
  await expect(site.locator('#checkout')).not.toHaveClass(/open/); // nothing was pressed
  await panel.screenshot({ path: `${SHOTS}sam-2-stopped-at-payment.png` });
  await site.bringToFront();
  await site.screenshot({ path: `${SHOTS}sam-3-site-cart.png` });

  // The hard block is in code: even a direct command to press the payment button is refused.
  const verdict = await sw.evaluate(async (id) => {
    const snap: any = await chrome.tabs.sendMessage(id, { type: 'snapshot' });
    const pay = snap.interactive.find((i: any) => i.name === 'Checkout and pay');
    const card = snap.interactive.length;
    return { pay: pay.commit, res: await chrome.tabs.sendMessage(id, { type: 'runStep', step: { op: 'click', ref: pay.ref, description: 'x' } }), card };
  }, tabId);
  expect(verdict.pay).toBe(true);
  expect(verdict.res.status).toBe('blocked');

  // The payment form's card fields are blocked too.
  await site.locator('#checkout-btn').click();
  const cardVerdict = await sw.evaluate(async (id) => {
    const snap: any = await chrome.tabs.sendMessage(id, { type: 'snapshot' });
    const cc = snap.interactive.find((i: any) => i.name === 'Card number');
    return { sensitive: cc.sensitive, res: await chrome.tabs.sendMessage(id, { type: 'runStep', step: { op: 'type', ref: cc.ref, value: '4111', description: 'x' } }) };
  }, tabId);
  expect(cardVerdict.sensitive).toBe(true);
  expect(cardVerdict.res.status).toBe('blocked');
  await expect(site.locator('#cc')).toHaveValue('');
});

test('Mia (Deaf) gets live captions, searches the transcript and gets a summary', async ({ open }) => {
  const { site, panel } = await open('/harbour-health/', { ...BASE_PROFILE, name: 'Mia', uses: { ...BASE_PROFILE.uses, captions: true }, defaultTab: 'captions' });
  // Opens straight on Captions: her saved preference.
  await expect(panel.getByRole('tab', { name: 'Captions' })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: 'Start captions' }).click();
  await site.getByRole('button', { name: 'Play video' }).click();
  await expect(panel.locator('.caption-lines').getByText("Hi, and welcome to Harbour Health. We're so glad you're joining the team.")).toBeVisible();
  await expect(panel.locator('.caption-lines').getByText('Your start date is Monday the 2nd of December, at 9 am.')).toBeVisible({ timeout: 15_000 });
  await panel.screenshot({ path: `${SHOTS}mia-1-live-captions.png` });
  await expect(panel.locator('.caption-lines').getByText(/Before Friday, please complete the online induction module/)).toBeVisible({ timeout: 20_000 });
  // Low-confidence words are marked.
  await expect(panel.locator('.unsure', { hasText: 'Your buddy is Priya' })).toHaveCount(1);
  await panel.getByRole('button', { name: 'Stop captions' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Captions stopped.' })).toBeVisible();

  await panel.getByLabel('Search the transcript').fill('start date');
  await expect(panel.locator('mark', { hasText: 'start date' })).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}mia-2-search.png` });
  await panel.getByLabel('Search the transcript').fill('');

  await panel.getByRole('button', { name: 'Summary of dates and actions' }).click();
  await expect(panel.getByText('Summary added to the end of the transcript.')).toBeVisible();
  await expect(panel.locator('.caption-lines .summary')).toContainText('Action: complete the online induction module by Friday.');
  await panel.screenshot({ path: `${SHOTS}mia-3-summary.png` });
});

test('Grace (low vision) makes the page bigger, high contrast, reading guide, plain English, then resets', async ({ open, sw }) => {
  const { site, panel, tabId } = await open('/seniors-card/', { ...BASE_PROFILE, name: 'Grace' });
  await expect(panel.getByRole('heading', { name: 'Hi Grace,' })).toBeVisible();
  const zoom = () => sw.evaluate((id) => chrome.tabs.getZoom(id), tabId);

  await ask(panel, 'Make the text bigger');
  await expect(panel.getByText('The page is now at 125%.')).toBeVisible();
  expect(await zoom()).toBeCloseTo(1.25);
  await ask(panel, 'Make it bigger');
  await expect(panel.getByText('The page is now at 150%.')).toBeVisible();
  expect(await zoom()).toBeCloseTo(1.5);

  await ask(panel, 'High contrast');
  await expect(panel.getByText('High contrast is on. Say "reset the page" to undo.')).toBeVisible();
  await expect(site.locator('html')).toHaveClass(/accessai-contrast/);
  await expect(site.locator('h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(site.locator('a').first()).toHaveCSS('color', 'rgb(255, 235, 59)');

  await ask(panel, 'Turn on the reading guide');
  await expect(site.locator('#accessai-reading-guide')).toHaveCount(1);
  await site.bringToFront();
  await site.mouse.move(300, 330);
  await site.screenshot({ path: `${SHOTS}grace-1-site-contrast-guide.png` });

  await ask(panel, 'Explain this in plain English');
  await expect(panel.getByText('IN PLAIN LANGUAGE')).toBeVisible();
  await expect(panel.getByText(/You can get a Seniors Card if you are 60 or older/)).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}grace-2-plain-english.png` });

  // Remembered per site.
  const stored = await sw.evaluate(() => chrome.storage.local.get('site:http://localhost:5173'));
  expect((stored as any)['site:http://localhost:5173'].visual.contrast).toBe(true);

  await ask(panel, 'reset the page');
  await expect(panel.getByText('The page is back to how it was.')).toBeVisible();
  expect(await zoom()).toBeCloseTo(1);
  await expect(site.locator('html')).not.toHaveClass(/accessai-contrast/);
  await expect(site.locator('#accessai-reading-guide')).toHaveCount(0);
});

test('Escape stops the agent, and the panel passes axe checks', async ({ open }) => {
  const { panel } = await open('/runner-shop/', { ...BASE_PROFILE, name: 'Sam' });
  for (const tab of ['Assistant', 'Captions', 'Tools', 'Settings']) {
    await panel.getByRole('tab', { name: tab }).click();
    const results = await new AxeBuilder({ page: panel }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${tab}: ${v.id} ${v.nodes.map((n) => n.target).join(',')}`)).toEqual([]);
  }
  await panel.getByRole('tab', { name: 'Tools' }).click();
  await panel.screenshot({ path: `${SHOTS}tools.png`, fullPage: true });
  // Arrow keys move between tabs.
  await panel.getByRole('tab', { name: 'Tools' }).press('ArrowRight');
  await expect(panel.getByRole('tab', { name: 'Settings' })).toBeFocused();
  await panel.getByRole('tab', { name: 'Assistant' }).click();
  await ask(panel, 'Summarise this page');
  await panel.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible();
});
