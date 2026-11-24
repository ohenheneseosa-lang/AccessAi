import { demoAssist, type AssistRequest, type AssistResponse } from '@accessai/shared';
import type { Profile } from './store.js';

export type Brain = 'ai' | 'demo' | 'offline';

/**
 * Ask the AccessAI API. Falls back to the on-device demo brain when demo mode
 * is on, or when the API can't be reached (and says so).
 */
export async function assist(req: AssistRequest, profile: Profile, signal?: AbortSignal): Promise<{ res: AssistResponse; brain: Brain }> {
  if (profile.demoMode) return { res: demoAssist(req), brain: 'demo' };
  try {
    const r = await fetch(`${profile.apiBase.replace(/\/$/, '')}/v1/assist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const res = (await r.json()) as AssistResponse;
    return { res, brain: res.answeredBy === 'demo' ? 'demo' : 'ai' };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return { res: demoAssist(req), brain: 'offline' };
  }
}

export async function reportSite(profile: Profile, url: string, barrier: string, details: string): Promise<boolean> {
  try {
    const r = await fetch(`${profile.apiBase.replace(/\/$/, '')}/v1/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, barrier, details }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
