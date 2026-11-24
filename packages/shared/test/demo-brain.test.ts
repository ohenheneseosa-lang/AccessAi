import { describe, expect, it } from 'vitest';
import { demoAssist, planFromCommand } from '../src/demo-brain.js';
import type { PageSnapshot } from '../src/types.js';

const shop: PageSnapshot = {
  url: 'http://localhost:5173/runner-shop/',
  title: 'Black Runner | Runner Shop',
  site: 'Runner Shop',
  lang: 'en-AU',
  headings: [{ level: 1, text: 'Black Runner', ref: 'e1' }],
  landmarks: ['main'],
  text: 'Free delivery on orders over $100.\nBlack Runner.\n$129.\nA light, cushioned road shoe for everyday runs.\nArrives in 2 to 4 business days.',
  interactive: [
    { ref: 'e2', role: 'combobox', name: 'Size', tag: 'select', options: ['Choose a size', '7', '8', '9', '10'], value: 'Choose a size', sensitive: false, commit: false },
    { ref: 'e3', role: 'button', name: 'Add to cart', tag: 'button', sensitive: false, commit: false },
    { ref: 'e4', role: 'button', name: 'Checkout and pay', tag: 'button', sensitive: false, commit: true },
  ],
  images: [{ ref: 'e5', alt: '', hasUsefulAlt: false, width: 400, height: 260 }],
};

const req = (mode: any, message: string, snapshot: PageSnapshot | undefined = shop) =>
  ({ mode, message, history: [], snapshot, readingLevel: 'simple' as const });

describe('demo brain', () => {
  it('plans size then add to cart, never the payment button', () => {
    const plan = planFromCommand('Add the black runners in size 10 to my cart', shop)!;
    expect(plan.steps).toEqual([
      { op: 'select', ref: 'e2', value: '10', description: 'Choose "10" in "Size" (selected: Choose a size)' },
      { op: 'click', ref: 'e3', description: 'Press "Add to cart"' },
    ]);
  });
  it('returns no plan for a size that does not exist', () => {
    expect(planFromCommand('add it in size 15 to my cart', shop)).toBeNull();
  });
  it('answers generic questions only from page text, with quotes', () => {
    const r = demoAssist(req('chat', 'How long does delivery take?'));
    expect(r.text).toContain('From the page:');
    expect(r.sources.join(' ')).toMatch(/2 to 4 business days|delivery/);
  });
  it('says "The page doesn\'t say" rather than guessing', () => {
    expect(demoAssist(req('chat', 'What are the ingredients?')).text).toBe("The page doesn't say.");
  });
  it('uses the prototype answers on the demo sites', () => {
    const demo = { ...shop, demo: 'runner-shop' };
    expect(demoAssist(req('summarise', 'Summarise', demo)).text).toMatch(/^This is Runner Shop/);
    expect(demoAssist(req('chat', 'What does delivery cost?', demo)).text).toMatch(/Delivery is free on orders over \$100/);
    const img = demoAssist(req('describe_images', 'Describe the images', demo));
    expect(img.aiDescription).toBe(true);
    expect(img.label).toBe('IMAGE 1');
  });
  it('summarises a transcript into dates and actions', () => {
    const r = demoAssist({ ...req('transcript_summary', 'Summarise'), transcript: 'Hello there. Your start is Monday at 9 am. Please bring photo ID.' });
    expect(r.text).toContain('Monday at 9 am');
    expect(r.text).toContain('Please bring photo ID');
  });
  it('handles a missing page', () => {
    expect(demoAssist({ ...req('summarise', 'x'), snapshot: undefined }).text).toMatch(/can't read this page/);
  });
});
