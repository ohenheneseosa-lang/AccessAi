export type TabName = 'assistant' | 'captions' | 'tools' | 'settings';

/** Preferences, never diagnoses. */
export interface Profile {
  name: string;
  uses: {
    screenReader: boolean;
    captions: boolean;
    largeText: boolean;
    plainEnglish: boolean;
    signLanguage: boolean;
  };
  defaultTab: TabName;
  readAloud: boolean;
  speechRate: number;
  readingLevel: 'simple' | 'standard';
  captionSize: number;
  apiBase: string;
  demoMode: boolean;
}

export const DEFAULT_PROFILE: Profile = {
  name: '',
  uses: { screenReader: false, captions: false, largeText: false, plainEnglish: false, signLanguage: false },
  defaultTab: 'assistant',
  readAloud: false,
  speechRate: 1,
  readingLevel: 'simple',
  captionSize: 22,
  apiBase: 'http://127.0.0.1:8787',
  demoMode: false,
};

export async function loadProfile(): Promise<{ profile: Profile; firstRun: boolean }> {
  const { profile, firstRun } = (await chrome.storage.local.get(['profile', 'firstRun'])) as { profile?: Partial<Profile>; firstRun?: boolean };
  return { profile: { ...DEFAULT_PROFILE, ...(profile ?? {}), uses: { ...DEFAULT_PROFILE.uses, ...(profile?.uses ?? {}) } }, firstRun: !profile || Boolean(firstRun) };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ profile, firstRun: false });
}

export async function exportAllData(): Promise<string> {
  return JSON.stringify(await chrome.storage.local.get(null), null, 2);
}

export async function deleteAllData(): Promise<void> {
  await chrome.storage.local.clear();
}
