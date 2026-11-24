import { judgeAction } from '@accessai/shared/src/safety.js';
import type { ActionStep } from '@accessai/shared/src/types.js';
import type { StepResult } from '../messages.js';
import { accessibleName, byRef, factsOf } from './snapshot.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The constrained action layer. Every step is checked against the hard
 * blocks in code before it touches the page; the model cannot override this.
 */
export async function runStep(step: ActionStep, confirmed = false): Promise<StepResult & { previousValue?: string }> {
  const el = byRef(step.ref);
  if (!el || !el.isConnected) return { status: 'failed', message: "I couldn't find that on the page any more." };
  const verdict = judgeAction(step.op, factsOf(el));
  if (verdict.kind === 'block') return { status: 'blocked', category: verdict.category, message: verdict.reason };
  if (verdict.kind === 'confirm' && !confirmed) return { status: 'confirm', message: verdict.reason };

  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  flash(el);

  switch (step.op) {
    case 'focus':
      el.focus();
      return { status: 'done', message: `Moved to "${accessibleName(el)}".` };
    case 'scroll':
      return { status: 'done', message: `Scrolled to "${accessibleName(el)}".` };
    case 'select': {
      if (!(el instanceof HTMLSelectElement)) return { status: 'failed', message: 'That is not a list I can choose from.' };
      const want = (step.value ?? '').trim().toLowerCase();
      const opt = Array.from(el.options).find((o) => o.text.trim().toLowerCase() === want || o.value.toLowerCase() === want);
      if (!opt) return { status: 'failed', message: `"${step.value}" is not one of the choices.` };
      const previousValue = el.value;
      el.focus();
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { status: 'done', message: `Chose "${opt.text.trim()}".`, previousValue };
    }
    case 'type': {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
        return { status: 'failed', message: "That isn't a text box." };
      const previousValue = el.value;
      el.focus();
      setNativeValue(el, step.value ?? '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { status: 'done', message: `Typed into "${accessibleName(el)}".`, previousValue };
    }
    case 'click': {
      if ((el as HTMLButtonElement).disabled) return { status: 'failed', message: `"${accessibleName(el)}" is not available right now.` };
      el.focus();
      el.click();
      await wait(450);
      return { status: 'done', message: `Pressed "${accessibleName(el)}".`, pageStatus: readStatus() };
    }
  }
  return { status: 'failed', message: 'I can only choose, press, type, focus or scroll.' };
}

export function undoStep(ref: string, previousValue: string): boolean {
  const el = byRef(ref);
  if (!(el instanceof HTMLSelectElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  setNativeValue(el, previousValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Text of the page's live / status regions (e.g. "In your cart: ..."). */
export function readStatus(): string {
  return Array.from(document.querySelectorAll('[role=status],[role=alert],[aria-live]:not([aria-live=off])'))
    .filter((e) => !e.closest('[data-accessai-ui]'))
    .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 300);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // Works with React-controlled inputs too.
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function flash(el: HTMLElement) {
  const prev = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  el.style.outline = '3px solid #2f4bf5';
  el.style.outlineOffset = '3px';
  setTimeout(() => {
    el.style.outline = prev;
    el.style.outlineOffset = prevOffset;
  }, 1600);
}
