import type { ActionStep, PageSnapshot } from '@accessai/shared';

export interface VisualState {
  contrast: boolean;
  readingGuide: boolean;
  readableFont: boolean;
  textSpacing: boolean;
  reduceMotion: boolean;
}
export const DEFAULT_VISUAL: VisualState = {
  contrast: false,
  readingGuide: false,
  readableFont: false,
  textSpacing: false,
  reduceMotion: false,
};

export type StepResult =
  | { status: 'done'; message: string; pageStatus?: string }
  | { status: 'blocked'; category: string; message: string }
  | { status: 'confirm'; message: string }
  | { status: 'failed'; message: string };

/** Panel -> content script. */
export type ContentRequest =
  | { type: 'ping' }
  | { type: 'snapshot' }
  | { type: 'runStep'; step: ActionStep; confirmed?: boolean }
  | { type: 'undoStep'; ref: string; previousValue: string }
  | { type: 'visual'; state: VisualState }
  | { type: 'jump'; ref: string }
  | { type: 'imageData'; ref: string }
  | { type: 'pageStatus' };

export type ContentResponse = {
  ping: { ok: true; demoSpeech: boolean };
  snapshot: PageSnapshot;
  runStep: StepResult & { previousValue?: string };
  undoStep: { ok: boolean };
  visual: { ok: true };
  jump: { ok: boolean; name?: string };
  imageData: { dataUrl: string | null };
  pageStatus: { text: string };
};

/** Content script -> panel (runtime broadcast). */
export type ContentEvent =
  | { type: 'escape' }
  | { type: 'demoSpeech'; text: string; confidence: number; final: boolean }
  | { type: 'demoSpeechEnded' };
