import { useEffect, useRef, useState } from 'preact/hooks';
import { BRAND, routeMessage, type AssistMode, type AssistResponse, type LocalIntent, type PageSnapshot, type Plan } from '@accessai/shared';
import { assist, type Brain } from './api.js';
import { IconCaptions, IconCheck, IconCopy, IconImage, IconInfo, IconLines, IconMic, IconSend, IconSpeaker, IconSpinner, IconStop } from './icons.js';
import { listen, speak, speechRecognitionAvailable, stopSpeaking, ensureMicPermission } from './speech.js';
import type { Profile, TabName } from './store.js';
import { send, PageAccessError } from './tab.js';

type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type ChatMessage =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'reply'; label: string | null; text: string; res?: AssistResponse; brain?: Brain }
  | { id: number; kind: 'working' | 'done'; goal: string; steps: { description: string; status: StepStatus }[] }
  | { id: number; kind: 'stopped'; goal: string }
  | { id: number; kind: 'confirm'; text: string; resolve?: (ok: boolean) => void; answered?: boolean }
  | { id: number; kind: 'chips'; text: string; chips: { label: string; action: () => void }[] };

export interface AssistantProps {
  profile: Profile;
  announce: (text: string, assertive?: boolean) => void;
  onLocal: (intent: LocalIntent) => Promise<string>;
  openTab: (t: TabName) => void;
  setStatus: (s: 'ready' | 'working' | 'offline') => void;
  stopSignal: number;
  pageKey: string;
}

let nextId = 1;
type NewMessage = ChatMessage extends infer T ? (T extends ChatMessage ? Omit<T, 'id'> : never) : never;

export function Assistant(props: AssistantProps) {
  const { profile, announce } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [canAdd, setCanAdd] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const push = (m: NewMessage) => {
    const id = nextId++;
    setMessages((ms) => [...ms, { ...m, id } as ChatMessage]);
    return id;
  };
  const update = (id: number, patch: Partial<ChatMessage>) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m)));

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  // Escape / "stop" from anywhere.
  useEffect(() => {
    if (props.stopSignal) stop();
  }, [props.stopSignal]);

  useEffect(() => {
    send({ type: 'snapshot' })
      .then((s) => setCanAdd(s.interactive.some((i) => /add to (cart|bag|basket|trolley)/i.test(i.name))))
      .catch(() => setCanAdd(false));
  }, [props.pageKey]);

  function stop() {
    if (abort.current) {
      abort.current.abort();
      abort.current = null;
      stopSpeaking();
      setBusy(false);
      props.setStatus('ready');
      announce('Stopped.', true);
    }
  }

  function reply(res: AssistResponse, brain: Brain) {
    push({ kind: 'reply', label: res.label, text: res.text, res, brain });
    announce(`${res.label ? res.label + '. ' : ''}${res.text}`);
    if (profile.readAloud) speak(res.text, profile.speechRate);
    props.setStatus(brain === 'offline' ? 'offline' : 'ready');
  }

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    push({ kind: 'user', text: t });
    const routed = routeMessage(t);
    if ('local' in routed) return runLocal(routed.local, t);
    await runAI(routed.ai, t);
  }

  async function runLocal(intent: LocalIntent, text: string) {
    try {
      if (intent.kind === 'stop') return stop();
      if (intent.kind === 'openTab') return props.openTab(intent.tab);
      if (intent.kind === 'payment') {
        const snap = await send({ type: 'snapshot' });
        const next = snap.interactive.find((i) => i.commit && !i.disabled);
        push({ kind: 'stopped', goal: text });
        const msg = `This step involves payment. Please do it yourself.${next ? ` The next step is: Press "${next.name}".` : ''}`;
        push({ kind: 'reply', label: null, text: msg });
        announce(`Stopped. ${msg}`, true);
        return;
      }
      if (intent.kind === 'whatCanIDo') {
        const snap = await send({ type: 'snapshot' });
        const things = snap.interactive
          .filter((i) => !i.disabled && i.name && (i.role === 'button' || i.role === 'combobox'))
          .slice(0, 6)
          .map((i) => `• ${i.role === 'combobox' ? `Choose ${i.name.toLowerCase()}` : `Press "${i.name}"`}${i.commit ? ' (you do this one yourself)' : ''}`);
        const textOut = things.length ? `On this page you can:\n${things.join('\n')}\n\nAsk me to do any of these.` : "I couldn't find any buttons or choices on this page.";
        push({ kind: 'reply', label: null, text: textOut });
        announce(textOut);
        return;
      }
      if (intent.kind === 'jump') {
        const snap = await send({ type: 'snapshot' });
        const target = intent.target.toLowerCase();
        const match = target && snap.headings.find((h) => h.text.toLowerCase().includes(target));
        if (match) return jumpTo(match.ref, match.text);
        if (!snap.headings.length) {
          push({ kind: 'reply', label: null, text: 'This page has no sections marked with headings.' });
          return;
        }
        push({
          kind: 'chips',
          text: target ? `I couldn't find "${intent.target}". Which section?` : 'Which section?',
          chips: snap.headings.slice(0, 12).map((h) => ({ label: h.text, action: () => jumpTo(h.ref, h.text) })),
        });
        announce(`${snap.headings.length} sections. Choose one.`);
        return;
      }
      const result = await props.onLocal(intent);
      push({ kind: 'reply', label: null, text: result });
      announce(result);
    } catch (e) {
      failed(e);
    }
  }

  async function jumpTo(ref: string, name: string) {
    const r = await send({ type: 'jump', ref });
    const text = r.ok ? `Moved to "${name}".` : "That section isn't on the page any more.";
    push({ kind: 'reply', label: null, text });
    announce(text);
  }

  function failed(e: unknown) {
    const text =
      e instanceof PageAccessError
        ? `I can't read this page yet. Open the Tools tab and choose "Allow ${BRAND.name} on this site", or try a normal web page.`
        : "Something went wrong. I didn't change anything. Please try again.";
    push({ kind: 'reply', label: null, text });
    announce(text, true);
    setBusy(false);
    props.setStatus('ready');
  }

  async function runAI(mode: AssistMode, text: string) {
    setBusy(true);
    props.setStatus('working');
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const snapshot: PageSnapshot = await send({ type: 'snapshot' });
      let images: { ref: string; dataUrl: string }[] | undefined;
      if (mode === 'describe_images') {
        images = [];
        for (const img of snapshot.images.filter((i) => !i.hasUsefulAlt).slice(0, 3)) {
          const { dataUrl } = await send({ type: 'imageData', ref: img.ref });
          if (dataUrl) images.push({ ref: img.ref, dataUrl });
        }
      }
      const history = messages
        .filter((m) => m.kind === 'user' || m.kind === 'reply')
        .slice(-8)
        .map((m) => ({ role: m.kind === 'user' ? ('user' as const) : ('assistant' as const), text: (m as { text: string }).text }));
      const { res, brain } = await assist(
        { mode, message: text, history, snapshot, images, readingLevel: profile.readingLevel },
        profile,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (res.plan && res.plan.steps.length) await runPlan(res.plan, ctrl, brain);
      else reply(res, brain);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') failed(e);
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setBusy(false);
    }
  }

  async function runPlan(plan: Plan, ctrl: AbortController, brain: Brain) {
    const steps = plan.steps.map((s) => ({ description: s.description, status: 'pending' as StepStatus }));
    const id = push({ kind: 'working', goal: plan.goal, steps });
    announce(`Working on it. ${plan.steps.length} steps.`);
    let pageStatus = '';
    for (let i = 0; i < plan.steps.length; i++) {
      if (ctrl.signal.aborted) {
        update(id, { kind: 'stopped' } as Partial<ChatMessage>);
        return;
      }
      const step = plan.steps[i]!;
      steps[i] = { ...steps[i]!, status: 'running' };
      update(id, { steps: [...steps] });
      announce(step.description);
      let result = await send({ type: 'runStep', step });
      if (result.status === 'confirm') {
        const ok = await confirm(result.message);
        if (!ok || ctrl.signal.aborted) {
          update(id, { kind: 'stopped' } as Partial<ChatMessage>);
          push({ kind: 'reply', label: null, text: "OK, I didn't do it. Nothing was sent." });
          announce("OK, I didn't do it.", true);
          props.setStatus('ready');
          return;
        }
        result = await send({ type: 'runStep', step, confirmed: true });
      }
      if (result.status === 'blocked' || result.status === 'failed') {
        steps[i] = { ...steps[i]!, status: 'failed' };
        update(id, { kind: 'stopped', steps: [...steps] } as Partial<ChatMessage>);
        push({ kind: 'reply', label: null, text: result.message });
        announce(`Stopped. ${result.message}`, true);
        props.setStatus('ready');
        return;
      }
      if (result.status === 'done' && result.pageStatus) pageStatus = result.pageStatus;
      steps[i] = { ...steps[i]!, status: 'done' };
      update(id, { steps: [...steps] });
    }
    update(id, { kind: 'done' } as Partial<ChatMessage>);
    const summary = pageStatus
      ? `Done. The page now says: “${pageStatus}”.${/cart|bag|basket|trolley/i.test(plan.goal) ? ' Say "check out" when you\'re ready.' : ''}`
      : 'Done.';
    push({ kind: 'reply', label: null, text: summary, brain });
    announce(summary);
    if (profile.readAloud) speak(summary, profile.speechRate);
    props.setStatus(brain === 'offline' ? 'offline' : 'ready');
  }

  function confirm(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      push({ kind: 'confirm', text, resolve });
      announce(text, true);
    });
  }

  async function talk() {
    if (listening) {
      stopListening.current?.();
      return;
    }
    if (!speechRecognitionAvailable()) {
      announce('Voice input is not available in this browser. Please type instead.', true);
      return;
    }
    setListening(true);
    announce('Listening.');
    stopListening.current = listen({
      continuous: false,
      onHeard: (h) => {
        setInput(h.text);
        if (h.final) ask(h.text);
      },
      onError: async (code) => {
        if (code === 'not-allowed') {
          await ensureMicPermission();
          announce('Please allow the microphone in the tab that opened, then try again.', true);
        }
      },
      onEnd: () => setListening(false),
    });
  }

  const greeting = profile.name ? `Hi ${profile.name},` : 'Hi there,';
  const chips = [
    'Summarise this page',
    ...(canAdd ? ['Add it to my cart'] : []),
    'Describe the images',
    'What can I do here?',
    'Jump to a section',
  ];

  return (
    <section class="assistant" aria-label="Assistant">
      {messages.length === 0 ? (
        <div class="home">
          <div class="orb" role="img" aria-label="" aria-hidden="true" onClick={talk} />
          <h1 class="greeting">{greeting}</h1>
          <p class="muted center">Ask me anything about this page, or tell me what to do. Tap the orb to talk, or type below.</p>
          <div class="tiles">
            <button class="tile" onClick={talk} aria-pressed={listening}>
              <span class="tile-icon primary"><IconMic /></span>
              {listening ? 'Listening…' : 'Talk to me'}
            </button>
            <button class="tile" onClick={() => ask('Summarise this page')}>
              <span class="tile-icon"><IconLines /></span>Summarise this page
            </button>
            <button class="tile" onClick={() => ask('Describe the images')}>
              <span class="tile-icon"><IconImage /></span>Describe images
            </button>
            <button class="tile" onClick={() => props.openTab('captions')}>
              <span class="tile-icon"><IconCaptions /></span>Captions
            </button>
          </div>
        </div>
      ) : (
        <>
          <div class="chat-top">
            <button class="link-btn" onClick={() => { stop(); setMessages([]); inputRef.current?.focus(); }}>New chat</button>
          </div>
          <div class="log" ref={logRef} role="log" aria-label="Conversation" aria-live="off">
            {messages.map((m) => (
              <Message key={m.id} m={m} profile={profile} onAnswer={(ok) => {
                if (m.kind === 'confirm' && !m.answered) {
                  update(m.id, { answered: true } as Partial<ChatMessage>);
                  m.resolve?.(ok);
                }
              }} />
            ))}
          </div>
          <div class="chips" role="group" aria-label="Suggestions">
            {chips.map((c) => (
              <button class="chip" disabled={busy} onClick={() => ask(c)}>{c}</button>
            ))}
          </div>
        </>
      )}
      <form class="composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <label class="sr-only" for="ask">Ask anything</label>
        <input id="ask" ref={inputRef} value={input} onInput={(e) => setInput((e.target as HTMLInputElement).value)} placeholder="Ask anything…" autocomplete="off" />
        <button type="button" class="icon-btn" aria-label={listening ? 'Stop listening' : 'Talk'} aria-pressed={listening} onClick={talk}>
          <IconMic />
        </button>
        {busy ? (
          <button type="button" class="send stop" aria-label="Stop" onClick={stop}><IconStop /></button>
        ) : (
          <button type="submit" class="send" aria-label="Send"><IconSend /></button>
        )}
      </form>
      <p class="footnote">{BRAND.safetyFooter}</p>
    </section>
  );
}

function Message({ m, profile, onAnswer }: { m: ChatMessage; profile: Profile; onAnswer: (ok: boolean) => void }) {
  const [why, setWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  switch (m.kind) {
    case 'user':
      return <div class="msg user"><span class="sr-only">You said: </span>{m.text}</div>;
    case 'working':
    case 'done':
    case 'stopped': {
      const steps = 'steps' in m ? m.steps : [];
      return (
        <div class={`msg bot ${m.kind}`}>
          <span class="avatar" aria-hidden="true" />
          <div class="card">
            <p class="card-title">
              {m.kind === 'working' && <IconSpinner size={14} />} {m.kind === 'working' ? 'Working on it' : m.kind === 'done' ? 'Done' : 'Stopped'}
            </p>
            <p class="quote">“{m.goal}”</p>
            {steps.length > 0 && (
              <ol class="steps">
                {steps.map((s) => (
                  <li class={s.status}>
                    <span class="dot" aria-hidden="true" />
                    {s.description}
                    <span class="sr-only"> ({s.status})</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      );
    }
    case 'confirm':
      return (
        <div class="msg bot">
          <span class="avatar" aria-hidden="true" />
          <div class="card confirm">
            <p>{m.text}</p>
            {!m.answered && (
              <div class="row">
                <button class="btn primary" onClick={() => onAnswer(true)}>Yes, go ahead</button>
                <button class="btn" onClick={() => onAnswer(false)}>No</button>
              </div>
            )}
          </div>
        </div>
      );
    case 'chips':
      return (
        <div class="msg bot">
          <span class="avatar" aria-hidden="true" />
          <div class="card">
            <p>{m.text}</p>
            <div class="chips">{m.chips.map((c) => <button class="chip" onClick={c.action}>{c.label}</button>)}</div>
          </div>
        </div>
      );
    case 'reply': {
      const res = m.res;
      return (
        <div class="msg bot">
          <span class="avatar" aria-hidden="true" />
          <div class="bubble">
            <div class="card">
              {m.label && <p class="label">{m.label}</p>}
              {res?.aiDescription && <p class="badge">AI description</p>}
              <p class="text">{m.text}</p>
              {m.brain === 'offline' && <p class="hint">Offline: answered on this device with reduced accuracy.</p>}
              {why && res && (
                <div class="why">
                  <p class="why-title">Why I said that</p>
                  {res.sources.length ? (
                    <ul>{res.sources.map((s) => <li>From the page: “{s}”</li>)}</ul>
                  ) : (
                    <p>{res.aiDescription ? 'This came from looking at the image, not from page text.' : 'No page text was quoted for this answer.'}</p>
                  )}
                  <p>Confidence: {res.confidence}. Answered by: {res.answeredBy === 'demo' ? 'demo mode (on this device)' : res.answeredBy}.</p>
                </div>
              )}
            </div>
            <div class="actions">
              <button class="mini" onClick={() => speak(m.text, profile.speechRate)}><IconSpeaker size={14} />Read aloud</button>
              <button class="mini" onClick={async () => { await navigator.clipboard.writeText(m.text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}{copied ? 'Copied' : 'Copy'}
              </button>
              {res && (
                <button class="mini" aria-expanded={why} onClick={() => setWhy(!why)}><IconInfo size={14} />Why?</button>
              )}
            </div>
          </div>
        </div>
      );
    }
  }
}
