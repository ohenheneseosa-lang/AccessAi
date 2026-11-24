import type { ContentRequest, ContentResponse } from '../messages.js';

/** The tab this panel works on. `?tab=<id>` pins it (used by tests). */
const pinned = Number(new URLSearchParams(location.search).get('tab')) || null;

export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  if (pinned) return chrome.tabs.get(pinned).catch(() => undefined);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export class PageAccessError extends Error {
  constructor(public origin: string | null) {
    super('no-access');
  }
}

/** Inject the content script on demand (activeTab / per-site permission). */
export async function ensureContent(tabId: number): Promise<void> {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'ping' } satisfies ContentRequest);
    if (pong?.ok) return;
  } catch {}
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    let origin: string | null = null;
    try {
      const u = new URL(tab?.url ?? '');
      if (u.protocol === 'http:' || u.protocol === 'https:') origin = `${u.origin}/*`;
    } catch {}
    throw new PageAccessError(origin);
  }
}

export async function send<K extends ContentRequest['type']>(
  msg: Extract<ContentRequest, { type: K }>,
): Promise<ContentResponse[K]> {
  const tab = await activeTab();
  if (!tab?.id) throw new PageAccessError(null);
  await ensureContent(tab.id);
  const res = await chrome.tabs.sendMessage(tab.id, msg);
  if (res && typeof res === 'object' && 'error' in res) throw new Error(String((res as { error: unknown }).error));
  return res as ContentResponse[K];
}

export async function requestSiteAccess(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [origin] });
}
