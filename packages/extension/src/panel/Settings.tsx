import { useEffect, useState } from 'preact/hooks';
import { BRAND } from '@accessai/shared';
import { deleteAllData, exportAllData, type Profile, type TabName } from './store.js';

export const USES: { key: keyof Profile['uses']; label: string; hint: string }[] = [
  { key: 'screenReader', label: 'I use a screen reader', hint: 'Every step is written into the chat so it is read to you.' },
  { key: 'captions', label: 'Captions', hint: 'Open on the Captions tab.' },
  { key: 'largeText', label: 'Large text and high contrast', hint: 'Open on the Tools tab.' },
  { key: 'plainEnglish', label: 'Plain English', hint: 'Short, simple answers.' },
  { key: 'signLanguage', label: 'Auslan', hint: 'Auslan help videos, made with Deaf presenters, are coming.' },
];

export function suggestedTab(uses: Profile['uses']): TabName {
  if (uses.captions && !uses.screenReader) return 'captions';
  if (uses.largeText && !uses.screenReader && !uses.captions) return 'tools';
  return 'assistant';
}

export function PreferenceFields({ draft, set }: { draft: Profile; set: (p: Profile) => void }) {
  return (
    <>
      <label class="field-label" for="name">What should I call you? (optional)</label>
      <input id="name" class="text-input" value={draft.name} autocomplete="given-name" onInput={(e) => set({ ...draft, name: (e.target as HTMLInputElement).value.slice(0, 40) })} />
      <fieldset class="checks">
        <legend class="field-label">How do you want to use {BRAND.name}? Choose any.</legend>
        {USES.map((u) => (
          <label class="check">
            <input type="checkbox" checked={draft.uses[u.key]} onChange={(e) => {
              const uses = { ...draft.uses, [u.key]: (e.target as HTMLInputElement).checked };
              set({ ...draft, uses, defaultTab: suggestedTab(uses), readingLevel: uses.plainEnglish ? 'simple' : draft.readingLevel });
            }} />
            <span><strong>{u.label}</strong><br /><span class="hint">{u.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <p class="hint">We store these choices on this device only. We never ask about or store a diagnosis.</p>
    </>
  );
}

export function Settings({ profile, save, announce }: { profile: Profile; save: (p: Profile) => void; announce: (t: string, assertive?: boolean) => void }) {
  const [draft, setDraft] = useState(profile);
  const [health, setHealth] = useState<string>('Checking…');
  useEffect(() => setDraft(profile), [profile]);
  useEffect(() => {
    if (draft.demoMode) return setHealth('Demo mode: answers come from this device, using sample responses on the demo sites.');
    fetch(`${draft.apiBase.replace(/\/$/, '')}/health`)
      .then((r) => r.json())
      .then((j) => setHealth(j.brain === 'claude' ? 'Connected. Answers come from Claude.' : 'Connected, but the service has no AI key, so it answers in demo mode.'))
      .catch(() => setHealth("Can't reach the AI service. I'll answer on this device with reduced accuracy."));
  }, [draft.apiBase, draft.demoMode]);

  const commit = (p: Profile) => {
    setDraft(p);
    save(p);
  };

  return (
    <section class="settings" aria-label="Settings">
      <form class="panel-card" onSubmit={(e) => { e.preventDefault(); save(draft); announce('Settings saved.'); }}>
        <h2 class="section-title">You</h2>
        <PreferenceFields draft={draft} set={setDraft} />
        <label class="field-label" for="deftab">Open on</label>
        <select id="deftab" class="text-input" value={draft.defaultTab} onChange={(e) => setDraft({ ...draft, defaultTab: (e.target as HTMLSelectElement).value as TabName })}>
          <option value="assistant">Assistant</option>
          <option value="captions">Captions</option>
          <option value="tools">Tools</option>
        </select>
        <button class="btn primary wide" type="submit">Save</button>
      </form>

      <div class="panel-card">
        <h2 class="section-title">Answers</h2>
        <label class="check">
          <input type="checkbox" checked={draft.readAloud} onChange={(e) => commit({ ...draft, readAloud: (e.target as HTMLInputElement).checked })} />
          <span>Read answers aloud automatically<br /><span class="hint">Leave off if your screen reader already reads them.</span></span>
        </label>
        <label class="field-label" for="rate">Speaking speed</label>
        <input id="rate" type="range" min="0.6" max="1.8" step="0.1" value={draft.speechRate} onChange={(e) => commit({ ...draft, speechRate: Number((e.target as HTMLInputElement).value) })} aria-valuetext={`${draft.speechRate} times`} />
        <label class="field-label" for="level">Reading level for plain English</label>
        <select id="level" class="text-input" value={draft.readingLevel} onChange={(e) => commit({ ...draft, readingLevel: (e.target as HTMLSelectElement).value as Profile['readingLevel'] })}>
          <option value="simple">Simple (about Year 5)</option>
          <option value="standard">Standard</option>
        </select>
      </div>

      <div class="panel-card">
        <h2 class="section-title">AI service</h2>
        <p class="hint" role="status">{health}</p>
        <label class="field-label" for="api">Service address</label>
        <input id="api" class="text-input" value={draft.apiBase} onChange={(e) => commit({ ...draft, apiBase: (e.target as HTMLInputElement).value.trim() })} />
        <label class="check">
          <input type="checkbox" checked={draft.demoMode} onChange={(e) => commit({ ...draft, demoMode: (e.target as HTMLInputElement).checked })} />
          <span>Demo mode (sample answers, nothing leaves this device)</span>
        </label>
      </div>

      <div class="panel-card">
        <h2 class="section-title">Privacy</h2>
        <ul class="plain-list">
          <li>Page text is sent to the AI only when you ask something, and is not kept.</li>
          <li>Passwords, card, bank and ID fields are never read or filled.</li>
          <li>Card, Medicare and tax file numbers are removed before anything is sent.</li>
          <li>Your settings stay on this device.</li>
        </ul>
        <div class="row gap">
          <button class="btn" onClick={async () => {
            const url = URL.createObjectURL(new Blob([await exportAllData()], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'accessai-my-data.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>Export my data</button>
          <button class="btn danger-outline" onClick={async () => { await deleteAllData(); announce('All your data on this device was deleted.', true); location.reload(); }}>Delete all my data</button>
        </div>
      </div>

      <div class="panel-card">
        <h2 class="section-title">How I keep you safe</h2>
        <ul class="plain-list">
          <li>I never handle passwords or card details.</li>
          <li>I stop before payment and hand over to you.</li>
          <li>I ask before anything that sends, books or pays.</li>
          <li>Press Escape or say "stop" to stop me at any time.</li>
          <li>Say "reset the page" to undo every visual change.</li>
        </ul>
      </div>
    </section>
  );
}
