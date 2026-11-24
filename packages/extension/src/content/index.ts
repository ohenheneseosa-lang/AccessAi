import type { ContentEvent, ContentRequest } from '../messages.js';
import { readStatus, runStep, undoStep } from './actions.js';
import { byRef, accessibleName, takeSnapshot } from './snapshot.js';
import { applyVisual } from './visual.js';

declare global {
  interface Window {
    __accessaiLoaded?: boolean;
  }
}

if (!window.__accessaiLoaded) {
  window.__accessaiLoaded = true;

  const emit = (e: ContentEvent) => chrome.runtime.sendMessage(e).catch(() => {});

  // Escape on the page stops the agent too.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') emit({ type: 'escape' });
  }, true);

  // Bundled demo sites announce their scripted speech so demo captions work
  // without a speech service. Real pages never fire this event.
  window.addEventListener('accessai:demo-speech', (e) => {
    const d = (e as CustomEvent).detail ?? {};
    if (typeof d.text === 'string') emit({ type: 'demoSpeech', text: d.text, confidence: Number(d.confidence ?? 0.95), final: d.final !== false });
  });
  window.addEventListener('accessai:demo-speech-ended', () => emit({ type: 'demoSpeechEnded' }));

  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, reply) => {
    handle(msg).then(reply, (err) => reply({ error: String(err?.message ?? err) }));
    return true;
  });
}

async function handle(msg: ContentRequest): Promise<unknown> {
  switch (msg.type) {
    case 'ping':
      return { ok: true, demoSpeech: Boolean(document.querySelector('meta[name="accessai-demo-speech"]')) };
    case 'snapshot':
      return takeSnapshot();
    case 'runStep':
      return runStep(msg.step, msg.confirmed);
    case 'undoStep':
      return { ok: undoStep(msg.ref, msg.previousValue) };
    case 'visual':
      applyVisual(msg.state);
      return { ok: true };
    case 'pageStatus':
      return { text: readStatus() };
    case 'jump': {
      const el = byRef(msg.ref);
      if (!el) return { ok: false };
      if (!el.hasAttribute('tabindex') && !/^(a|button|input|select|textarea)$/i.test(el.tagName)) el.setAttribute('tabindex', '-1');
      el.scrollIntoView({ block: 'start' });
      el.focus();
      return { ok: true, name: accessibleName(el) };
    }
    case 'imageData':
      return { dataUrl: await imageToDataUrl(msg.ref) };
  }
}

async function imageToDataUrl(ref: string): Promise<string | null> {
  const el = byRef(ref);
  if (!el) return null;
  try {
    let source: CanvasImageSource;
    let w: number, h: number;
    if (el instanceof HTMLImageElement) {
      await el.decode().catch(() => {});
      source = el;
      w = el.naturalWidth;
      h = el.naturalHeight;
    } else if (el instanceof SVGSVGElement) {
      const xml = new XMLSerializer().serializeToString(el);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await img.decode();
      source = img;
      const r = el.getBoundingClientRect();
      w = r.width * 2;
      h = r.height * 2;
    } else return null;
    const scale = Math.min(1, 1024 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85); // throws for cross-origin images
  } catch {
    return null;
  }
}
