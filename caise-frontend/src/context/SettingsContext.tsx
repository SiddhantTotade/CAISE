import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { loadPreferences, savePreferences, type Preferences } from "../lib/settings";

interface SettingsState {
  prefs: Preferences;
  updatePrefs: (patch: Partial<Preferences>) => void;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);

  const updatePrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, updatePrefs }), [prefs, updatePrefs]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
