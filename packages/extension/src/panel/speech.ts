/** Read text aloud with the device voice (en-AU preferred). */
export function speak(text: string, rate = 1) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/•/g, ''));
  u.lang = 'en-AU';
  u.rate = rate;
  const voice = speechSynthesis.getVoices().find((v) => v.lang === 'en-AU');
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function speechRecognitionAvailable(): boolean {
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface Heard {
  text: string;
  final: boolean;
  /** Per-word confidence is not exposed by browsers; this is per phrase. */
  confidence: number;
}

/** Microphone speech recognition, tuned for Australian English. */
export function listen(opts: {
  continuous: boolean;
  onHeard: (h: Heard) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}): () => void {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec: Recognition = new Ctor();
  rec.lang = 'en-AU';
  rec.continuous = opts.continuous;
  rec.interimResults = true;
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      opts.onHeard({ text: r[0].transcript.trim(), final: r.isFinal, confidence: r[0].confidence || 0.9 });
    }
  };
  rec.onerror = (e: any) => opts.onError(String(e.error));
  rec.onend = opts.onEnd;
  rec.start();
  return () => rec.stop();
}

/** Side panels can't show the mic prompt, so ask once in a normal tab. */
export async function ensureMicPermission(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (status.state === 'granted') return true;
  } catch {}
  await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  return false;
}
