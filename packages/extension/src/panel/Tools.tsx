import { useEffect, useState } from 'preact/hooks';
import type { Heading } from '@accessai/shared';
import type { VisualState } from '../messages.js';
import { reportSite } from './api.js';
import type { PageLook } from './pageControls.js';
import type { Profile } from './store.js';
import { activeTab, ensureContent, PageAccessError, requestSiteAccess, send } from './tab.js';

const TOGGLES: { key: keyof VisualState; label: string; hint: string }[] = [
  { key: 'contrast', label: 'High contrast', hint: 'White text on black, links in yellow.' },
  { key: 'readingGuide', label: 'Reading guide', hint: 'A band that follows your pointer.' },
  { key: 'readableFont', label: 'Easier-to-read font', hint: 'A clearer font for the whole page.' },
  { key: 'textSpacing', label: 'More text spacing', hint: 'More space between lines, words and letters.' },
  { key: 'reduceMotion', label: 'Reduce motion', hint: 'Stops animations on the page.' },
];

export function Tools(props: {
  look: PageLook;
  profile: Profile;
  pageKey: string;
  canUndo: boolean;
  onZoom: (d: 'in' | 'out') => void;
  onToggle: (key: keyof VisualState, on: boolean) => void;
  onUndo: () => void;
  onReset: () => void;
  announce: (t: string, assertive?: boolean) => void;
}) {
  const { look } = props;
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [needsAccess, setNeedsAccess] = useState<string | null>(null);
  const [reported, setReported] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const tab = await activeTab();
        if (tab?.id) await ensureContent(tab.id);
        setNeedsAccess(null);
        const s = await send({ type: 'snapshot' });
        setHeadings(s.headings);
      } catch (e) {
        if (e instanceof PageAccessError && e.origin) setNeedsAccess(e.origin);
        setHeadings([]);
      }
    })();
  }, [props.pageKey]);

  async function report(form: HTMLFormElement) {
    const data = new FormData(form);
    const tab = await activeTab();
    const ok = await reportSite(props.profile, tab?.url ?? '', String(data.get('barrier')), String(data.get('details') ?? ''));
    const msg = ok ? 'Thanks. Your report was sent. We only sent the site address, not the page content.' : "I couldn't send the report. Please try again later.";
    setReported(msg);
    props.announce(msg, !ok);
  }

  return (
    <section class="tools" aria-label="Tools">
      {needsAccess && (
        <div class="panel-card notice-card">
          <p>I need your permission to read and adjust this site.</p>
          <button class="btn accent wide" onClick={async () => { if (await requestSiteAccess(needsAccess)) setNeedsAccess(null); }}>
            Allow AccessAI on this site
          </button>
        </div>
      )}
      <div class="panel-card">
        <h2 class="section-title">Page size</h2>
        <div class="stepper">
          <button class="btn" aria-label="Make the page smaller" onClick={() => props.onZoom('out')}>A−</button>
          <output aria-live="polite">{Math.round(look.zoom * 100)}%</output>
          <button class="btn" aria-label="Make the page bigger" onClick={() => props.onZoom('in')}>A+</button>
        </div>
        <p class="hint">Scales the whole page, like "Make it bigger".</p>
      </div>
      <div class="panel-card">
        <h2 class="section-title">How the page looks</h2>
        {TOGGLES.map((t) => (
          <div class="switch-row">
            <div>
              <p class="switch-label" id={`l-${t.key}`}>{t.label}</p>
              <p class="hint" id={`h-${t.key}`}>{t.hint}</p>
            </div>
            <button role="switch" class="switch" aria-checked={look.visual[t.key]} aria-labelledby={`l-${t.key}`} aria-describedby={`h-${t.key}`} onClick={() => props.onToggle(t.key, !look.visual[t.key])}>
              <span class="knob" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div class="row gap">
          <button class="btn" onClick={props.onUndo} disabled={!props.canUndo}>Undo last change</button>
          <button class="btn" onClick={props.onReset}>Reset the page</button>
        </div>
        <p class="hint">Changes are remembered for this site. Say "reset the page" at any time.</p>
      </div>
      <div class="panel-card">
        <h2 class="section-title">Jump to a section</h2>
        {headings.length ? (
          <ul class="headings">
            {headings.map((h) => (
              <li style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                <button class="link-btn" onClick={async () => { const r = await send({ type: 'jump', ref: h.ref }); props.announce(r.ok ? `Moved to ${h.text}` : 'That section is gone.'); }}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="hint">No sections found on this page.</p>
        )}
      </div>
      <div class="panel-card">
        <h2 class="section-title">Report this site</h2>
        <p class="hint">Tell the site and us about a barrier. We send only the site address and what you choose here.</p>
        <form onSubmit={(e) => { e.preventDefault(); report(e.currentTarget); }}>
          <label class="field-label" for="barrier">What's wrong?</label>
          <select id="barrier" name="barrier" class="text-input">
            <option value="unlabelled-image">Images have no descriptions</option>
            <option value="unlabelled-button">Buttons or links have no names</option>
            <option value="no-captions">Video has no captions</option>
            <option value="low-contrast">Text is hard to see</option>
            <option value="keyboard-trap">I get stuck using the keyboard</option>
            <option value="other">Something else</option>
          </select>
          <label class="field-label" for="details">Details (optional)</label>
          <textarea id="details" name="details" class="text-input" rows={2} maxLength={2000} />
          <button class="btn wide" type="submit">Send report</button>
        </form>
        {reported && <p class="hint" role="status">{reported}</p>}
      </div>
    </section>
  );
}
