import type { VisualState } from '../messages.js';

const STYLE_ID = 'accessai-visual-style';
const GUIDE_ID = 'accessai-reading-guide';

const CSS = {
  // :where() keeps specificity low so the link and focus rules win.
  contrast: `
    html.accessai-contrast, html.accessai-contrast body { background: #000 !important; }
    html.accessai-contrast body :where(*:not(img, video, canvas, svg, svg *, [data-accessai-ui], [data-accessai-ui] *)) {
      background-color: #000 !important; color: #fff !important; border-color: #fff !important;
      text-shadow: none !important; box-shadow: none !important; opacity: 1 !important;
    }
    html.accessai-contrast body a:where(:not([data-accessai-ui] *)),
    html.accessai-contrast body a:where(:not([data-accessai-ui] *)) * { color: #ffeb3b !important; text-decoration: underline !important; }
    html.accessai-contrast body :where(button, select, input, textarea):where(:not([data-accessai-ui] *)) { border: 2px solid #fff !important; }
    html.accessai-contrast body :focus-visible { outline: 3px solid #ffeb3b !important; outline-offset: 2px !important; }`,
  readableFont: `
    html.accessai-font body :where(*:not([data-accessai-ui] *, code, pre, code *, pre *)) {
      font-family: "Atkinson Hyperlegible", "Lexend", Verdana, Tahoma, sans-serif !important;
    }`,
  // WCAG 1.4.12 text spacing values.
  textSpacing: `
    html.accessai-spacing body :where(*:not([data-accessai-ui] *)) {
      line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important;
    }
    html.accessai-spacing body p:where(:not([data-accessai-ui] *)) { margin-bottom: 2em !important; }`,
  reduceMotion: `
    html.accessai-motion *, html.accessai-motion *::before, html.accessai-motion *::after {
      animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important; scroll-behavior: auto !important;
    }`,
};

let guideHandler: ((e: PointerEvent) => void) | null = null;
let focusHandler: ((e: FocusEvent) => void) | null = null;

export function applyVisual(state: VisualState) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = Object.values(CSS).join('\n');
    (document.head ?? document.documentElement).appendChild(style);
  }
  const html = document.documentElement.classList;
  html.toggle('accessai-contrast', state.contrast);
  html.toggle('accessai-font', state.readableFont);
  html.toggle('accessai-spacing', state.textSpacing);
  html.toggle('accessai-motion', state.reduceMotion);
  setGuide(state.readingGuide, state.contrast);
}

/** A horizontal band that follows the pointer, and keyboard focus. */
function setGuide(on: boolean, contrast: boolean) {
  let guide = document.getElementById(GUIDE_ID);
  if (!on) {
    guide?.remove();
    if (guideHandler) window.removeEventListener('pointermove', guideHandler);
    if (focusHandler) window.removeEventListener('focusin', focusHandler);
    guideHandler = focusHandler = null;
    return;
  }
  if (!guide) {
    guide = document.createElement('div');
    guide.id = GUIDE_ID;
    guide.setAttribute('data-accessai-ui', '');
    guide.setAttribute('aria-hidden', 'true');
    Object.assign(guide.style, {
      position: 'fixed', left: '0', right: '0', height: '2.4em', top: '40vh', pointerEvents: 'none',
      zIndex: '2147483646', borderTop: '3px solid #2f4bf5', borderBottom: '3px solid #2f4bf5',
    } satisfies Partial<CSSStyleDeclaration>);
    document.documentElement.appendChild(guide);
    const move = (y: number) => (guide!.style.top = `${Math.max(0, y - guide!.offsetHeight / 2)}px`);
    guideHandler = (e) => move(e.clientY);
    focusHandler = (e) => {
      const r = (e.target as Element).getBoundingClientRect?.();
      if (r) move(r.top + r.height / 2);
    };
    window.addEventListener('pointermove', guideHandler, { passive: true });
    window.addEventListener('focusin', focusHandler);
  }
  guide.style.background = contrast ? 'rgba(47,75,245,0.18)' : 'rgba(47,75,245,0.08)';
}
