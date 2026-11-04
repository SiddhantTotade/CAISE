import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import type { ModelCatalog, ModelSelection, ProviderInfo } from "../lib/types";
import { useSettings } from "../context/SettingsContext";

interface UseModels {
  catalog: ModelCatalog | null;
  loading: boolean;
  error: string | null;
  /** Effective selection: the saved choice if still offered, else the backend default. */
  selection: ModelSelection | null;
  provider: ProviderInfo | null;
  select: (selection: ModelSelection) => void;
  reload: () => void;
}

export function useModels(): UseModels {
  const { prefs, updatePrefs } = useSettings();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .models()
      .then((c) => {
        if (!active) return;
        setCatalog(c);
        setError(null);
      })
      .catch((e: unknown) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [nonce]);

  const selection = useMemo<ModelSelection | null>(() => {
    if (!catalog) return null;
    const saved = prefs.model;
    const savedProvider = saved && catalog.providers.find((p) => p.id === saved.provider);
    if (saved && savedProvider?.models.includes(saved.model)) return saved;
    const fallback = catalog.providers.find((p) => p.id === catalog.default_provider) ?? catalog.providers[0];
    return fallback ? { provider: fallback.id, model: fallback.default_model } : null;
  }, [catalog, prefs.model]);

  const provider = useMemo(
    () => catalog?.providers.find((p) => p.id === selection?.provider) ?? null,
    [catalog, selection],
  );

  const select = useCallback((next: ModelSelection) => updatePrefs({ model: next }), [updatePrefs]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { catalog, loading, error, selection, provider, select, reload };
}
