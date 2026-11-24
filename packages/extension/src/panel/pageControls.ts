import { DEFAULT_VISUAL, type VisualState } from '../messages.js';
import { activeTab, send } from './tab.js';

export interface PageLook {
  zoom: number;
  visual: VisualState;
}
export const DEFAULT_LOOK: PageLook = { zoom: 1, visual: DEFAULT_VISUAL };
export const ZOOM_STEPS = [0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/**
 * Whole-page visual changes, remembered per site, every change undoable.
 */
export class PageControls {
  look: PageLook = DEFAULT_LOOK;
  private undoStack: PageLook[] = [];
  private origin: string | null = null;

  async load(): Promise<PageLook> {
    const tab = await activeTab();
    this.origin = originOf(tab?.url);
    const key = this.key();
    const stored = (key ? (await chrome.storage.local.get(key))[key] : undefined) as Partial<PageLook> | undefined;
    this.look = { zoom: stored?.zoom ?? 1, visual: { ...DEFAULT_VISUAL, ...(stored?.visual ?? {}) } };
    this.undoStack = [];
    if (tab?.id) this.look.zoom = (await chrome.tabs.getZoom(tab.id).catch(() => this.look.zoom)) || this.look.zoom;
    return this.look;
  }

  /** Re-apply the remembered look (after navigation). */
  async reapply(): Promise<void> {
    if (!isDefault(this.look)) await this.apply(this.look);
  }

  async change(next: { zoom?: number; visual?: Partial<VisualState> }): Promise<PageLook> {
    this.undoStack.push(this.look);
    const look: PageLook = {
      zoom: next.zoom ?? this.look.zoom,
      visual: { ...this.look.visual, ...(next.visual ?? {}) },
    };
    await this.apply(look);
    return look;
  }

  async zoom(direction: 'in' | 'out'): Promise<PageLook> {
    const cur = this.look.zoom;
    const z =
      direction === 'in'
        ? ZOOM_STEPS.find((s) => s > cur + 0.01) ?? ZOOM_STEPS.at(-1)!
        : [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.01) ?? ZOOM_STEPS[0]!;
    return this.change({ zoom: z });
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  async undo(): Promise<PageLook | null> {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    await this.apply(prev);
    return prev;
  }

  async reset(): Promise<PageLook> {
    this.undoStack.push(this.look);
    await this.apply(DEFAULT_LOOK);
    return DEFAULT_LOOK;
  }

  private async apply(look: PageLook) {
    const tab = await activeTab();
    if (tab?.id) await chrome.tabs.setZoom(tab.id, look.zoom).catch(() => {});
    await send({ type: 'visual', state: look.visual });
    this.look = look;
    const key = this.key();
    if (key) await chrome.storage.local.set({ [key]: look });
  }

  private key() {
    return this.origin ? `site:${this.origin}` : null;
  }
}

function originOf(url?: string): string | null {
  try {
    const u = new URL(url ?? '');
    return u.protocol.startsWith('http') ? u.origin : null;
  } catch {
    return null;
  }
}
function isDefault(l: PageLook) {
  return l.zoom === 1 && !Object.values(l.visual).some(Boolean);
}
