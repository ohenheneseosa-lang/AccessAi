import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ContentEvent } from '../messages.js';
import { assist } from './api.js';
import { ensureMicPermission, listen, speechRecognitionAvailable } from './speech.js';
import type { Profile } from './store.js';
import { send } from './tab.js';

interface Line {
  id: number;
  at: number;
  text: string;
  confidence: number;
  summary?: boolean;
}

type Source = 'tab' | 'mic';
const LOW_CONFIDENCE = 0.7;
let lineId = 1;

export function Captions({ profile, announce, toast, saveSize }: {
  profile: Profile;
  announce: (t: string, assertive?: boolean) => void;
  toast: (t: string) => void;
  saveSize: (n: number) => void;
}) {
  const [source, setSource] = useState<Source>('tab');
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState('');
  const [size, setSize] = useState(profile.captionSize);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [summarising, setSummarising] = useState(false);
  const stopper = useRef<(() => void) | null>(null);
  const started = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const addLine = (text: string, confidence: number, summary = false) =>
    setLines((ls) => [...ls, { id: lineId++, at: Date.now() - started.current, text, confidence, summary }]);

  // Demo caption source: scripted speech from the bundled demo sites.
  useEffect(() => {
    const onMsg = (e: ContentEvent) => {
      if (!running || source !== 'tab') return;
      if (e.type === 'demoSpeech') addLine(e.text, e.confidence);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [running, source]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [lines, interim]);

  async function start() {
    setNotice('');
    started.current = started.current || Date.now();
    if (source === 'mic') {
      if (!speechRecognitionAvailable()) return setNotice('Microphone captions are not available in this browser.');
      setRunning(true);
      const begin = () => {
        stopper.current = listen({
          continuous: true,
          onHeard: (h) => {
            if (h.final) {
              setInterim('');
              addLine(h.text, h.confidence);
            } else setInterim(h.text);
          },
          onError: async (code) => {
            if (code === 'not-allowed') {
              setRunning(false);
              await ensureMicPermission();
              setNotice('Allow the microphone in the tab that just opened, then press Start captions again.');
            }
          },
          // Speech recognition ends after silence; keep going until stopped.
          onEnd: () => (stopper.current ? begin() : undefined),
        });
      };
      begin();
      announce('Captions started from the microphone.');
      return;
    }
    // This tab: the demo sites provide scripted speech; real tab audio needs a speech service.
    try {
      const pong = await send({ type: 'ping' });
      if (!pong.demoSpeech) {
        setNotice('Captions from tab audio need a speech service, which is not set up yet. Choose Microphone to caption what your device hears.');
        return;
      }
    } catch {
      setNotice("I can't reach this tab. Try Microphone instead.");
      return;
    }
    setRunning(true);
    announce('Captions started. Play the video.');
  }

  function stop() {
    const s = stopper.current;
    stopper.current = null;
    s?.();
    setInterim('');
    setRunning(false);
    toast('Captions stopped.');
    announce('Captions stopped.');
  }

  async function summarise() {
    const transcript = lines.filter((l) => !l.summary).map((l) => l.text).join(' ');
    if (!transcript) {
      announce('There is nothing to summarise yet.', true);
      return;
    }
    setSummarising(true);
    let snapshot;
    try {
      snapshot = await send({ type: 'snapshot' });
    } catch {}
    const { res } = await assist({ mode: 'transcript_summary', message: 'Summarise the transcript', history: [], transcript, snapshot, readingLevel: profile.readingLevel }, profile);
    addLine(res.text, 1, true);
    setSummarising(false);
    toast('Summary added to the end of the transcript.');
    announce(res.text);
  }

  function exportTranscript() {
    const body = lines.map((l) => `[${fmt(l.at)}] ${l.summary ? '' : ''}${l.text}`).join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const changeSize = (d: number) => {
    const n = Math.min(48, Math.max(14, size + d));
    setSize(n);
    saveSize(n);
    announce(`Caption text ${n} pixels.`);
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : []), [q, lines]);
  const shown = q ? matches : lines.slice(-4);

  return (
    <section class="captions" aria-label="Captions">
      <div class="panel-card">
        <h2 class="section-title">Live captions</h2>
        <p class="field-label" id="listen-label">Listen to</p>
        <div class="segmented" role="radiogroup" aria-labelledby="listen-label">
          {(['tab', 'mic'] as const).map((s) => (
            <button role="radio" aria-checked={source === s} class={source === s ? 'on' : ''} disabled={running} onClick={() => setSource(s)}>
              {s === 'tab' ? 'This tab' : 'Microphone'}
            </button>
          ))}
        </div>
        {running ? (
          <button class="btn wide danger" onClick={stop}><span class="rec" aria-hidden="true" />Stop captions</button>
        ) : (
          <button class="btn wide accent" onClick={start}><span class="rec" aria-hidden="true" />Start captions</button>
        )}
        <p class="hint">Captions appear a few seconds after speech. Tuned for Australian English. Auto captions may contain errors; unsure words are underlined.</p>
        {notice && <p class="notice" role="alert">{notice}</p>}
      </div>

      <div class="caption-box" style={{ fontSize: `${size}px` }}>
        <div class="caption-head">
          <h2>Captions</h2>
          <div class="row">
            <button class="size-btn" aria-label="Smaller caption text" onClick={() => changeSize(-2)}>A−</button>
            <button class="size-btn" aria-label="Larger caption text" onClick={() => changeSize(2)}>A+</button>
          </div>
        </div>
        <div class="caption-lines" ref={boxRef} aria-live="polite" aria-atomic="false">
          {shown.length === 0 && !interim && <p class="placeholder">{q ? 'No matches.' : 'Captions will appear here.'}</p>}
          {shown.map((l) => (
            <p class={l.summary ? 'summary' : ''}>
              <Highlighted text={l.text} q={q} lowConfidence={!l.summary && l.confidence < LOW_CONFIDENCE} />
            </p>
          ))}
          {interim && !q && <p class="interim">{interim}</p>}
        </div>
      </div>

      <div class="panel-card">
        <h2 class="section-title">Transcript</h2>
        <label class="field-label" for="tsearch">Search the transcript</label>
        <input id="tsearch" class="text-input" type="search" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        {q && <p class="hint" aria-live="polite">{matches.length} {matches.length === 1 ? 'match' : 'matches'}</p>}
        <div class="row gap">
          <button class="btn" onClick={summarise} disabled={summarising || lines.length === 0}>{summarising ? 'Summarising…' : 'Summary of dates and actions'}</button>
          <button class="btn" onClick={exportTranscript} disabled={lines.length === 0}>Export</button>
        </div>
        <details class="full-transcript">
          <summary>Full transcript ({lines.length} lines)</summary>
          <ol>{lines.map((l) => <li><span class="time">{fmt(l.at)}</span> {l.text}</li>)}</ol>
        </details>
      </div>
    </section>
  );
}

function Highlighted({ text, q, lowConfidence }: { text: string; q: string; lowConfidence: boolean }) {
  const body = lowConfidence ? (
    <span class="unsure" title="Low confidence">{text}<span class="sr-only"> (unsure)</span></span>
  ) : text;
  if (!q) return <>{body}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{body}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
