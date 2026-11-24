import type { JSX } from 'preact';

type P = { size?: number };
const base = (size = 18) =>
  ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' }) as const;

export const IconChat = ({ size }: P) => <svg {...base(size)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>;
export const IconCaptions = ({ size }: P) => <svg {...base(size)}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" /></svg>;
export const IconTools = ({ size }: P) => <svg {...base(size)}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.3-.6-.6-2.3z" /></svg>;
export const IconSettings = ({ size }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
export const IconMic = ({ size }: P) => <svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IconSend = ({ size }: P) => <svg {...base(size)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>;
export const IconStop = ({ size }: P) => <svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
export const IconLines = ({ size }: P) => <svg {...base(size)}><path d="M4 7h16M4 12h12M4 17h8" /></svg>;
export const IconImage = ({ size }: P) => <svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 9" /></svg>;
export const IconSpeaker = ({ size }: P) => <svg {...base(size)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>;
export const IconCopy = ({ size }: P) => <svg {...base(size)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
export const IconInfo = ({ size }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>;
export const IconGlobe = ({ size }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
export const IconCheck = ({ size }: P) => <svg {...base(size)}><path d="m5 12 5 5 9-10" /></svg>;
export const IconSpinner = ({ size }: P) => <svg {...base(size)} class="spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>;

export function Logo({ size = 28 }: P): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#111" />
      <path d="M10 25a10 10 0 0 1 20 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" />
      <circle cx="20" cy="24" r="3.2" fill="#4b63ff" />
    </svg>
  );
}
