import { DEMO_FIXTURES } from './demo-fixtures.js';
import type { ActionStep, AssistRequest, AssistResponse, Interactive, PageSnapshot } from './types.js';

/**
 * Demo brain: answers without any AI service. Used when no API key is set,
 * when the API is unreachable (offline), and by the bundled demo sites.
 * It only ever repeats text that is on the page; when it cannot find an
 * answer it says "The page doesn't say".
 */
export function demoAssist(req: AssistRequest): AssistResponse {
  const snap = req.snapshot;
  const fixture = snap?.demo ? DEMO_FIXTURES[snap.demo] : undefined;
  const base = { plan: null, aiDescription: false, answeredBy: 'demo' } as const;

  switch (req.mode) {
    case 'summarise': {
      if (fixture) return { ...base, label: 'SUMMARY', ...fixture.summary, confidence: 'high' };
      if (!snap) return noPage();
      return { ...base, label: 'SUMMARY', ...genericSummary(snap), confidence: 'medium' };
    }
    case 'describe_images': {
      if (!snap || snap.images.length === 0)
        return { ...base, label: null, text: "I couldn't find any images on this page.", sources: [], confidence: 'high' };
      const missing = snap.images.filter((i) => !i.hasUsefulAlt);
      if (fixture?.images) {
        const text = fixture.images.map((i) => i.text).join('\n\n');
        return { ...base, label: 'IMAGE 1', text, sources: [], confidence: 'medium', aiDescription: true };
      }
      const described = snap.images
        .filter((i) => i.hasUsefulAlt)
        .slice(0, 5)
        .map((i, n) => `Image ${n + 1}: ${i.alt}`);
      const text = [
        described.length ? `The page describes ${described.length === 1 ? 'this image' : 'these images'}:\n${described.join('\n')}` : '',
        missing.length
          ? `${missing.length} image${missing.length === 1 ? ' has' : 's have'} no description. Describing ${missing.length === 1 ? 'it' : 'them'} needs the AI service, which is off in demo mode.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return { ...base, label: 'IMAGES', text, sources: described, confidence: 'high' };
    }
    case 'plain_english': {
      if (fixture?.plainEnglish) return { ...base, label: 'IN PLAIN LANGUAGE', ...fixture.plainEnglish, confidence: 'high' };
      if (!snap) return noPage();
      const sentences = splitSentences(snap.text).slice(0, 5);
      return {
        ...base,
        label: 'IN PLAIN LANGUAGE',
        text: `Rewriting in plain English needs the AI service, which is off in demo mode. Here are the first points on the page:\n\n${sentences.map((s) => `• ${s}`).join('\n')}`,
        sources: sentences,
        confidence: 'low',
      };
    }
    case 'transcript_summary': {
      const transcript = req.transcript ?? '';
      if (!transcript.trim())
        return { ...base, label: null, text: 'There is nothing in the transcript yet.', sources: [], confidence: 'high' };
      if (fixture?.transcriptSummary) return { ...base, label: 'SUMMARY', text: fixture.transcriptSummary, sources: [], confidence: 'high' };
      const s = splitSentences(transcript);
      const dates = s.filter((x) => DATE_RE.test(x));
      const actions = s.filter((x) => /\b(please|need to|must|make sure|remember to|bring|complete|before|by )\b/i.test(x));
      const text = [
        'Summary:',
        ...s.slice(0, 2).map((x) => `• ${x}`),
        dates.length ? '\nDates and times:' : '',
        ...dates.map((x) => `• ${x}`),
        actions.length ? '\nActions:' : '',
        ...actions.map((x) => `• ${x}`),
      ]
        .filter(Boolean)
        .join('\n');
      return { ...base, label: 'SUMMARY', text, sources: [...dates, ...actions], confidence: 'medium' };
    }
    case 'chat':
    default:
      return demoChat(req, snap, fixture);
  }
}

const DATE_RE =
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(st|nd|rd|th)?\b|\d{1,2}(:\d{2})? ?(am|pm))\b/i;

function noPage(): AssistResponse {
  return {
    label: null,
    text: "I can't read this page. Open AccessAI on a web page and try again.",
    sources: [],
    plan: null,
    confidence: 'high',
    aiDescription: false,
    answeredBy: 'demo',
  };
}

function genericSummary(snap: PageSnapshot): { text: string; sources: string[] } {
  const h1 = snap.headings.find((h) => h.level === 1)?.text ?? snap.title;
  const first = splitSentences(snap.text).filter((s) => s.length > 30).slice(0, 2);
  const actions = snap.interactive
    .filter((i) => (i.role === 'button' || i.role === 'combobox') && !i.disabled && i.name)
    .slice(0, 4)
    .map((i) => (i.role === 'combobox' ? `choose ${i.name.toLowerCase()}` : `press "${i.name}"`));
  const text =
    `This page is "${h1}" on ${snap.site}. ${first.join(' ')}`.trim() +
    (actions.length ? `\n\nYou can: ${actions.join(', ')}.` : '');
  return { text, sources: [h1, ...first] };
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const STOP = new Set(
  'a an the is are was were be to of in on for and or what whats what\'s does do how much many can i my me you it this that there here with about at by from'.split(' '),
);
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
}
const SYNONYMS: Record<string, string[]> = {
  cost: ['price', '$', 'free', 'fee'],
  delivery: ['shipping', 'postage', 'deliver', 'arrives'],
  price: ['cost', '$'],
  size: ['sizes'],
};

function demoChat(req: AssistRequest, snap: PageSnapshot | undefined, fixture?: (typeof DEMO_FIXTURES)[string]): AssistResponse {
  const base = { label: null, plan: null, aiDescription: false, answeredBy: 'demo' } as const;
  if (!snap) return noPage();
  const msg = req.message;

  // Agent request: "add the black runners in size 10 to my cart"
  const plan = planFromCommand(msg, snap);
  if (plan) return { ...base, text: 'Working on it', sources: [], plan, confidence: 'high' };
  if (/\b(add|put)\b.*\b(cart|bag|basket|trolley)\b/i.test(msg))
    return { ...base, text: "I couldn't find an add to cart button on this page.", sources: [], confidence: 'high' };

  const q = fixture?.questions?.find((x) => x.match.test(msg));
  if (q) return { ...base, text: q.text, sources: q.sources, confidence: 'high' };

  // Grounded retrieval: best-matching sentences from the page, quoted.
  const asked = words(msg);
  if (asked.length === 0)
    return { ...base, text: 'Ask me about this page, or tell me what to do. For example: "Summarise this page".', sources: [], confidence: 'high' };
  const groups = asked.map((w) => [w, ...(SYNONYMS[w] ?? [])]);
  const scored = splitSentences(snap.text)
    .map((s) => {
      const sw = new Set(words(s));
      const lower = s.toLowerCase();
      const score = groups.filter((g) => g.some((w) => sw.has(w) || (w === '$' && lower.includes('$')))).length;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (scored.length === 0 || scored[0]!.score < Math.max(1, Math.ceil(asked.length / 3)))
    return { ...base, text: "The page doesn't say.", sources: [], confidence: 'high' };
  const quotes = scored.map((x) => x.s);
  return {
    ...base,
    text: `From the page: ${quotes.map((x) => `“${x}”`).join(' ')}`,
    sources: quotes,
    confidence: 'medium',
  };
}

/** Builds a plan for "add [product] in size N to my cart" style commands. */
export function planFromCommand(msg: string, snap: PageSnapshot): { goal: string; steps: ActionStep[] } | null {
  if (!/\b(add|put)\b/i.test(msg) || !/\b(cart|bag|basket|trolley)\b/i.test(msg)) return null;
  const addBtn = snap.interactive.find(
    (i) => i.role === 'button' && /\badd to (cart|bag|basket|trolley)\b/i.test(i.name) && !i.disabled && !i.sensitive,
  );
  if (!addBtn) return null;
  const steps: ActionStep[] = [];
  const size = msg.match(/\bsize\s+([a-z0-9.]+)/i)?.[1];
  if (size) {
    const sel = findChoice(snap.interactive, /size/i);
    if (sel) {
      const option = sel.options?.find((o) => o.trim().toLowerCase() === size.toLowerCase()) ??
        sel.options?.find((o) => new RegExp(`\\b${size.replace('.', '\\.')}\\b`, 'i').test(o));
      if (!option) return null;
      steps.push({
        op: 'select',
        ref: sel.ref,
        value: option,
        description: `Choose "${option}" in "${sel.name}"${sel.value ? ` (selected: ${sel.value})` : ''}`,
      });
    }
  }
  steps.push({ op: 'click', ref: addBtn.ref, description: `Press "${addBtn.name}"` });
  return { goal: msg.trim(), steps };
}

function findChoice(items: Interactive[], label: RegExp): Interactive | undefined {
  return items.find((i) => (i.role === 'combobox' || i.role === 'listbox') && label.test(i.name) && !i.sensitive);
}
