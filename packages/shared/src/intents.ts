import { isPaymentRequest } from './safety.js';
import type { AssistMode } from './types.js';

/**
 * Commands that run on the device with no AI call: they are instant, work
 * offline, and are always undoable ("reset the page").
 */
export type LocalIntent =
  | { kind: 'stop' }
  | { kind: 'reset' }
  | { kind: 'undo' }
  | { kind: 'zoom'; direction: 'in' | 'out' }
  | { kind: 'contrast'; on: boolean | 'toggle' }
  | { kind: 'readingGuide'; on: boolean | 'toggle' }
  | { kind: 'readableFont'; on: boolean | 'toggle' }
  | { kind: 'textSpacing'; on: boolean | 'toggle' }
  | { kind: 'reduceMotion'; on: boolean | 'toggle' }
  | { kind: 'jump'; target: string }
  | { kind: 'openTab'; tab: 'captions' | 'tools' | 'settings' }
  | { kind: 'payment' }
  | { kind: 'whatCanIDo' };

export type Routed = { local: LocalIntent } | { ai: AssistMode };

function onOff(text: string): boolean | 'toggle' {
  if (/\b(off|stop|disable|remove|hide|no more)\b/i.test(text)) return false;
  if (/\b(on|start|enable|show|use|turn on|switch on)\b/i.test(text)) return true;
  return 'toggle';
}

export function routeMessage(raw: string): Routed {
  const text = raw.trim().replace(/[.!?]+$/, '');
  const t = text.toLowerCase();

  if (/^(stop|cancel|halt|abort|wait|stop it|stop that)$/.test(t)) return { local: { kind: 'stop' } };
  if (/\breset (the )?page\b|\bundo (all|everything)\b|\bput (it|the page) back\b/.test(t))
    return { local: { kind: 'reset' } };
  if (/^undo( that| the last (step|change))?$/.test(t)) return { local: { kind: 'undo' } };

  if (/\b(make (it|the (text|page|words?))|text|page|words?) (bigger|larger)\b|^(bigger|larger|zoom in)$|\bzoom in\b|\bmake it bigger\b|\bincrease (the )?(text|font|zoom)/.test(t))
    return { local: { kind: 'zoom', direction: 'in' } };
  if (/\b(smaller|zoom out)\b|\bdecrease (the )?(text|font|zoom)/.test(t))
    return { local: { kind: 'zoom', direction: 'out' } };
  if (/\bhigh contrast\b|\bcontrast\b/.test(t)) return { local: { kind: 'contrast', on: onOff(t) } };
  if (/\breading (guide|line|ruler|mask)\b/.test(t)) return { local: { kind: 'readingGuide', on: onOff(t) } };
  if (/\b(dyslexi\w*|readable|easier) font\b/.test(t)) return { local: { kind: 'readableFont', on: onOff(t) } };
  if (/\b(text|line|letter|word) spacing\b|\bspace (the )?text\b/.test(t))
    return { local: { kind: 'textSpacing', on: onOff(t) } };
  if (/\b(reduce|stop|less) (motion|animation)s?\b|\bno animations?\b/.test(t))
    return { local: { kind: 'reduceMotion', on: true } };

  if (/^jump to a section$/.test(t)) return { local: { kind: 'jump', target: '' } };
  const jump = t.match(/^(?:jump|go|skip|take me) to (?:the )?(.+?)(?: section)?$/);
  if (jump && jump[1] && !/\bcart|checkout|payment\b/.test(jump[1])) return { local: { kind: 'jump', target: jump[1] } };

  if (/^(open |show |turn on |start )?(live )?captions?$/.test(t)) return { local: { kind: 'openTab', tab: 'captions' } };
  if (/^(open )?(tools|settings)$/.test(t)) return { local: { kind: 'openTab', tab: t.endsWith('tools') ? 'tools' : 'settings' } };

  if (/^what can i do( here)?$/.test(t)) return { local: { kind: 'whatCanIDo' } };
  if (isPaymentRequest(t)) return { local: { kind: 'payment' } };

  if (/\bdescribe (the |this |that )?(images?|photos?|pictures?|product photo)\b|\bwhat does (the|this) (image|photo|picture) show\b/.test(t))
    return { ai: 'describe_images' };
  if (/\bplain (english|language)\b|\bexplain (this|the page|it) (simply|in plain)|\bsimpler words\b|\beasy read\b/.test(t))
    return { ai: 'plain_english' };
  if (/\bsummari[sz]e( this| the)? page\b|\bwhat'?s (this|the) page (about|for)\b|\bwhat is (this|the) page (about|for)\b|\bwhere am i\b/.test(t))
    return { ai: 'summarise' };
  return { ai: 'chat' };
}
