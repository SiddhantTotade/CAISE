import type { ModelSelection, ProviderId } from "./types";

export type CloudProvider = Exclude<ProviderId, "ollama">;
export const CLOUD_PROVIDERS: CloudProvider[] = ["openai", "anthropic", "deepseek"];

export interface Preferences {
  /** Last chosen model; null until the user picks one (the backend default is used). */
  model: ModelSelection | null;
  useContext: boolean;
  contextSnippets: number;
  openContextDrawer: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  model: null,
  useContext: true,
  contextSnippets: 5,
  openContextDrawer: true,
};

const PREFS_KEY = "caise.preferences";
const LEGACY_KEYS_KEY = "caise.apiKeys";
const LEGACY_REMEMBER_KEY = "caise.rememberKeys";

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const loadPreferences = (): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...(read<Partial<Preferences>>(localStorage, PREFS_KEY) ?? {}),
});

export const savePreferences = (prefs: Preferences): void =>
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

/** Provider keys used to be kept in the browser; they are server-side now, so purge any leftovers. */
export function purgeLegacyApiKeys(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(LEGACY_KEYS_KEY);
    storage.removeItem(LEGACY_REMEMBER_KEY);
  }
}
