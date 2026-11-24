import { isCommitControl, isSensitiveField, type ElementFacts } from '@accessai/shared/src/safety.js';
import { redactSensitive } from '@accessai/shared/src/redact.js';
import type { Interactive, PageImage, PageSnapshot, Heading } from '@accessai/shared/src/types.js';

const REF_ATTR = 'data-accessai-ref';
let nextRef = 1;

export function refOf(el: Element): string {
  let ref = el.getAttribute(REF_ATTR);
  if (!ref) {
    ref = `e${nextRef++}`;
    el.setAttribute(REF_ATTR, ref);
  }
  return ref;
}
export function byRef(ref: string): HTMLElement | null {
  return document.querySelector(`[${REF_ATTR}="${CSS.escape(ref)}"]`);
}

function isHidden(el: Element): boolean {
  if ((el as HTMLElement).closest?.('[data-accessai-ui]')) return true;
  if (el.closest('[aria-hidden="true"],[hidden],[inert]')) return true;
  const s = getComputedStyle(el);
  return s.display === 'none' || s.visibility === 'hidden';
}

/** Accessible name, close to the accname algorithm for common cases. */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    if (t.trim()) return clean(t);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const label = el.labels?.[0];
    if (label) return clean(label.textContent ?? '');
    if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'button')) return clean(el.value);
    if ('placeholder' in el && el.placeholder) return clean(el.placeholder);
    return clean(el.getAttribute('title') ?? el.name ?? '');
  }
  if (el instanceof HTMLImageElement) return clean(el.alt);
  const text = clean((el as HTMLElement).innerText ?? el.textContent ?? '');
  if (text) return text;
  const img = el.querySelector('img[alt]');
  return clean(img?.getAttribute('alt') ?? el.getAttribute('title') ?? '');
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 200);

export function factsOf(el: Element): ElementFacts {
  const input = el as HTMLInputElement;
  return {
    tag: el.tagName.toLowerCase(),
    type: input.type || undefined,
    role: roleOf(el),
    name: accessibleName(el),
    id: el.id || undefined,
    htmlName: input.name || undefined,
    autocomplete: input.autocomplete || el.getAttribute('autocomplete') || undefined,
    placeholder: input.placeholder || undefined,
  };
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type;
    if (['submit', 'button', 'reset', 'image'].includes(t)) return 'button';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    return 'textbox';
  }
  return tag;
}

const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=combobox],[contenteditable=true]';
const SKIP_TEXT = 'script,style,noscript,template,svg,[data-accessai-ui]';

export function takeSnapshot(): PageSnapshot {
  const interactive: Interactive[] = [];
  for (const el of Array.from(document.querySelectorAll(INTERACTIVE)).slice(0, 400)) {
    if (isHidden(el)) continue;
    const facts = factsOf(el);
    const sensitive = isSensitiveField(facts);
    const item: Interactive = {
      ref: refOf(el),
      role: facts.role ?? facts.tag,
      name: facts.name ?? '',
      tag: facts.tag,
      type: facts.type,
      disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      sensitive,
      commit: isCommitControl(facts),
    };
    if (el instanceof HTMLSelectElement) {
      item.options = Array.from(el.options).map((o) => clean(o.text));
      item.value = clean(el.selectedOptions[0]?.text ?? '');
    } else if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !sensitive) {
      if (el.type === 'checkbox' || el.type === 'radio') item.value = (el as HTMLInputElement).checked ? 'checked' : 'not checked';
      else if (el.value) item.value = redactSensitive(el.value.slice(0, 200));
    }
    interactive.push(item);
  }

  const headings: Heading[] = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role=heading]'))
    .filter((h) => !isHidden(h))
    .slice(0, 80)
    .map((h) => ({
      level: Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)) || 2,
      text: clean((h as HTMLElement).innerText),
      ref: refOf(h),
    }))
    .filter((h) => h.text);

  const landmarks = Array.from(document.querySelectorAll('header,nav,main,aside,footer,[role=banner],[role=navigation],[role=main],[role=complementary],[role=contentinfo],[role=search]'))
    .filter((l) => !isHidden(l))
    .map((l) => `${l.getAttribute('role') ?? l.tagName.toLowerCase()}${l.getAttribute('aria-label') ? `: ${l.getAttribute('aria-label')}` : ''}`)
    .slice(0, 20);

  const images: PageImage[] = Array.from(document.querySelectorAll('img,[role=img],svg[aria-label]'))
    .filter((i) => !isHidden(i))
    .map((i) => {
      const rect = i.getBoundingClientRect();
      const alt = i instanceof HTMLImageElement ? i.alt ?? '' : i.getAttribute('aria-label') ?? '';
      const caption = clean(i.closest('figure')?.querySelector('figcaption')?.textContent ?? i.getAttribute('data-caption') ?? '');
      return {
        ref: refOf(i),
        alt: clean(alt),
        hasUsefulAlt: isUsefulAlt(alt),
        caption: caption || undefined,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    })
    .filter((i) => i.width >= 48 && i.height >= 48)
    .slice(0, 30);

  return {
    url: location.href,
    title: document.title,
    site: siteName(),
    lang: document.documentElement.lang || 'en',
    headings,
    landmarks,
    text: redactSensitive(readableText()).slice(0, 80_000),
    interactive,
    images,
    demo: document.querySelector('meta[name="accessai-demo"]')?.getAttribute('content') ?? undefined,
  };
}

function isUsefulAlt(alt: string): boolean {
  const a = alt.trim();
  if (a.length < 4) return false;
  return !/^(img|image|photo|picture|dsc|untitled)?[\w-]*\.(jpe?g|png|gif|webp|svg)$/i.test(a) && !/^(image|photo|picture|img)\s*\d*$/i.test(a);
}

function siteName(): string {
  return (
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ??
    document.querySelector('meta[name="application-name"]')?.getAttribute('content') ??
    location.hostname.replace(/^www\./, '')
  );
}

function readableText(): string {
  const root = document.querySelector('main,[role=main]') ? document.body : document.body;
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || p.closest(SKIP_TEXT)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent?.trim()) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let last: Element | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement!;
    if (isHidden(p)) continue;
    // Never send what is typed into sensitive fields; text nodes don't include values anyway.
    const block = p.closest('p,li,h1,h2,h3,h4,h5,h6,td,th,dd,dt,blockquote,figcaption,label,button,a,div,section');
    const text = n.textContent!.replace(/\s+/g, ' ').trim();
    if (block !== last && out.length) out.push('\n');
    else if (out.length) out.push(' ');
    out.push(text);
    last = block;
  }
  return out.join('').replace(/\n{2,}/g, '\n').replace(/([^.!?:\n])\n/g, '$1.\n');
}
