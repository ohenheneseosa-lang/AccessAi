import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { sanitisePlan } from '../src/claude.js';

const snapshot = {
  url: 'http://localhost/', title: 't', site: 's', lang: 'en', headings: [], landmarks: [], text: 'Free delivery on orders over $100.', images: [],
  interactive: [
    { ref: 'e1', role: 'button', name: 'Add to cart', tag: 'button', sensitive: false, commit: false },
    { ref: 'e2', role: 'button', name: 'Pay', tag: 'button', sensitive: false, commit: true },
    { ref: 'e3', role: 'textbox', name: 'Card number', tag: 'input', sensitive: true, commit: false },
  ],
};

describe('API', () => {
  it('health reports the brain', async () => {
    const app = buildApp({ brain: 'demo' });
    expect((await app.inject('/health')).json()).toEqual({ ok: true, brain: 'demo' });
  });
  it('rejects bad requests', async () => {
    const app = buildApp({ brain: 'demo' });
    const r = await app.inject({ method: 'POST', url: '/v1/assist', payload: { mode: 'nope' } });
    expect(r.statusCode).toBe(400);
  });
  it('answers in demo mode', async () => {
    const app = buildApp({ brain: 'demo' });
    const r = await app.inject({ method: 'POST', url: '/v1/assist', payload: { mode: 'chat', message: 'What about delivery?', snapshot } });
    expect(r.statusCode).toBe(200);
    expect(r.json().answeredBy).toBe('demo');
  });
  it('returns 502 when the AI fails, so the extension can fall back', async () => {
    const app = buildApp({ brain: 'claude', assist: vi.fn().mockRejectedValue(new Error('down')) });
    const r = await app.inject({ method: 'POST', url: '/v1/assist', payload: { mode: 'chat', message: 'hi' } });
    expect(r.statusCode).toBe(502);
  });
  it('allows only extension origins', async () => {
    const app = buildApp({ brain: 'demo' });
    const ok = await app.inject({ method: 'OPTIONS', url: '/v1/assist', headers: { origin: 'chrome-extension://abc' } });
    expect(ok.headers['access-control-allow-origin']).toBe('chrome-extension://abc');
    const bad = await app.inject({ method: 'OPTIONS', url: '/v1/assist', headers: { origin: 'https://evil.example' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('stores only the origin of reported sites', async () => {
    const app = buildApp({ brain: 'demo' });
    const r = await app.inject({ method: 'POST', url: '/v1/reports', payload: { url: 'https://shop.example/p/123?email=a@b.c', barrier: 'unlabelled-image' } });
    expect(r.statusCode).toBe(201);
  });
});

describe('sanitisePlan', () => {
  const req = { mode: 'chat' as const, message: '', history: [], snapshot, readingLevel: 'simple' as const };
  it('drops steps on sensitive, commit or unknown elements', () => {
    const plan = sanitisePlan(
      {
        goal: 'g',
        steps: [
          { op: 'click', ref: 'e1', description: 'add' },
          { op: 'click', ref: 'e2', description: 'pay' },
          { op: 'type', ref: 'e3', value: '4111', description: 'card' },
          { op: 'click', ref: 'e99', description: 'ghost' },
        ],
      },
      req,
    );
    expect(plan?.steps.map((s) => s.ref)).toEqual(['e1']);
  });
  it('returns null when nothing safe is left', () => {
    expect(sanitisePlan({ goal: 'g', steps: [{ op: 'click', ref: 'e2', description: 'pay' }] }, req)).toBeNull();
  });
});
