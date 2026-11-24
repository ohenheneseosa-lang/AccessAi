import { useEffect, useRef, useState } from 'preact/hooks';
import { BRAND, type LocalIntent } from '@accessai/shared';
import type { ContentEvent, VisualState } from '../messages.js';
import { Assistant } from './Assistant.js';
import { Captions } from './Captions.js';
import { IconCaptions, IconChat, IconGlobe, IconSettings, IconTools } from './icons.js';
import { DEFAULT_LOOK, PageControls, type PageLook } from './pageControls.js';
import { PreferenceFields, Settings } from './Settings.js';
import { DEFAULT_PROFILE, loadProfile, saveProfile, type Profile, type TabName } from './store.js';
import { activeTab } from './tab.js';
import { Tools } from './Tools.js';

const TABS: { id: TabName; label: string; Icon: typeof IconChat }[] = [
  { id: 'assistant', label: 'Assistant', Icon: IconChat },
  { id: 'captions', label: 'Captions', Icon: IconCaptions },
  { id: 'tools', label: 'Tools', Icon: IconTools },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

const controls = new PageControls();

export function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [tab, setTab] = useState<TabName>('assistant');
  const [page, setPage] = useState({ label: '', key: '' });
  const [status, setStatus] = useState<'ready' | 'working' | 'offline'>('ready');
  const [look, setLook] = useState<PageLook>(DEFAULT_LOOK);
  const [toastText, setToastText] = useState('');
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const [stopSignal, setStopSignal] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const announce = (text: string, urgent = false) => {
    const set = urgent ? setAssertive : setPolite;
    set('');
    setTimeout(() => set(text), 60);
  };
  const toast = (t: string) => {
    setToastText(t);
    setTimeout(() => setToastText(''), 3500);
  };

  useEffect(() => {
    loadProfile().then(({ profile, firstRun }) => {
      setProfile(profile);
      setFirstRun(firstRun);
      setTab(profile.defaultTab);
    });
    refreshPage();
    const onActivated = () => refreshPage();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.status === 'complete') refreshPage(true);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    const onMsg = (e: ContentEvent) => {
      if (e.type === 'escape') setStopSignal((n) => n + 1);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStopSignal((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMsg);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  async function refreshPage(reapply = false) {
    const t = await activeTab();
    let host = '';
    try {
      host = new URL(t?.url ?? '').hostname;
    } catch {}
    const title = (t?.title ?? '').split(/\s[|–-]\s/);
    const label = [title[0], title[1], host].filter(Boolean).join(' · ');
    setPage({ label, key: `${t?.id}:${t?.url}` });
    try {
      setLook(await controls.load());
      if (reapply) await controls.reapply();
    } catch {}
  }

  async function onLocal(intent: LocalIntent): Promise<string> {
    const pct = (l: PageLook) => `${Math.round(l.zoom * 100)}%`;
    const toggle = async (key: keyof VisualState, on: boolean | 'toggle', name: string) => {
      const value = on === 'toggle' ? !controls.look.visual[key] : on;
      setLook(await controls.change({ visual: { [key]: value } as Partial<VisualState> }));
      return value ? `${name} is on. Say "reset the page" to undo.` : `${name} is off.`;
    };
    switch (intent.kind) {
      case 'zoom': {
        const l = await controls.zoom(intent.direction);
        setLook(l);
        return `The page is now at ${pct(l)}.`;
      }
      case 'contrast':
        return toggle('contrast', intent.on, 'High contrast');
      case 'readingGuide':
        return toggle('readingGuide', intent.on, 'The reading guide');
      case 'readableFont':
        return toggle('readableFont', intent.on, 'The easier-to-read font');
      case 'textSpacing':
        return toggle('textSpacing', intent.on, 'More text spacing');
      case 'reduceMotion':
        return toggle('reduceMotion', intent.on, 'Reduce motion');
      case 'reset':
        setLook(await controls.reset());
        return 'The page is back to how it was.';
      case 'undo': {
        const l = await controls.undo();
        if (!l) return 'There is nothing to undo.';
        setLook(l);
        return `Undone. The page is at ${pct(l)}.`;
      }
      default:
        return '';
    }
  }

  function save(p: Profile) {
    setProfile(p);
    saveProfile(p);
  }

  function onTabKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + dir + TABS.length) % TABS.length;
    setTab(TABS[next]!.id);
    tabRefs.current[TABS[next]!.id]?.focus();
  }

  if (!profile) return <div class="loading" role="status">Loading…</div>;

  if (firstRun)
    return (
      <Onboarding
        initial={profile}
        done={(p) => {
          save(p);
          setFirstRun(false);
          setTab(p.defaultTab);
          announce(`All set. ${BRAND.name} will open on ${p.defaultTab}.`);
        }}
      />
    );

  const statusText = status === 'working' ? 'Working' : status === 'offline' ? 'Offline, reduced accuracy' : 'Ready';

  return (
    <div class="app">
      {toastText && <div class="toast" role="status">{toastText}</div>}
      <header class="header">
        <div class="brand">
          <span class="mini-orb" aria-hidden="true" />
          <div>
            <p class="brand-name">{BRAND.name}</p>
            <p class={`status ${status}`}><span class="status-dot" aria-hidden="true" />{statusText}</p>
          </div>
        </div>
        <span class="plan-badge">Free</span>
      </header>
      {page.label && (
        <p class="page-chip"><IconGlobe size={12} /><span class="sr-only">Current page: </span>{page.label}</p>
      )}
      <nav class="tabs" role="tablist" aria-label={`${BRAND.name} sections`}>
        {TABS.map((t, i) => (
          <button
            role="tab"
            id={`tab-${t.id}`}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            class={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <t.Icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} class="tabpanel">
        <div hidden={tab !== 'assistant'} class="fill">
          <Assistant
            profile={profile}
            announce={announce}
            onLocal={onLocal}
            openTab={setTab}
            setStatus={setStatus}
            stopSignal={stopSignal}
            pageKey={page.key}
          />
        </div>
        {tab === 'captions' && <Captions profile={profile} announce={announce} toast={toast} saveSize={(n) => save({ ...profile, captionSize: n })} />}
        {tab === 'tools' && (
          <Tools
            look={look}
            profile={profile}
            pageKey={page.key}
            canUndo={controls.canUndo()}
            announce={announce}
            onZoom={async (d) => { const l = await controls.zoom(d); setLook(l); announce(`Page at ${Math.round(l.zoom * 100)}%`); }}
            onToggle={async (k, on) => setLook(await controls.change({ visual: { [k]: on } as Partial<VisualState> }))}
            onUndo={async () => { const l = await controls.undo(); if (l) setLook(l); announce(l ? 'Undone.' : 'Nothing to undo.'); }}
            onReset={async () => { setLook(await controls.reset()); announce('The page is back to how it was.'); }}
          />
        )}
        {tab === 'settings' && <Settings profile={profile} save={save} announce={announce} />}
      </main>
      <div class="sr-only" aria-live="polite" role="status">{polite}</div>
      <div class="sr-only" aria-live="assertive" role="alert">{assertive}</div>
    </div>
  );
}

function Onboarding({ initial, done }: { initial: Profile; done: (p: Profile) => void }) {
  const [draft, setDraft] = useState<Profile>({ ...DEFAULT_PROFILE, ...initial });
  return (
    <main class="onboarding">
      <div class="orb small" aria-hidden="true" />
      <h1>Welcome to {BRAND.name}</h1>
      <p class="muted">{BRAND.tagline} Tell me how you'd like to use it. You can change this any time in Settings.</p>
      <form class="panel-card" onSubmit={(e) => { e.preventDefault(); done(draft); }}>
        <PreferenceFields draft={draft} set={setDraft} />
        <button class="btn primary wide" type="submit">Start</button>
      </form>
      <ul class="plain-list small">
        <li>I never handle passwords or card details.</li>
        <li>I ask before anything that sends, books or pays.</li>
        <li>Press Escape to stop me at any time.</li>
      </ul>
    </main>
  );
}
