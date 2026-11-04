import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../lib/format";
import type { ProviderInfo, StoredKey } from "../../lib/types";
import { Button } from "../ui/Button";
import { ErrorNotice, Spinner } from "../ui/Feedback";

interface ApiKeyFieldProps {
  label: string;
  info: ProviderInfo | undefined;
  /** The user's saved key for this provider, if any (only the hint is ever known). */
  saved: StoredKey | undefined;
  /** Create or replace the key. */
  onSave: (key: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function ApiKeyField({ label, info, saved, onSave, onRemove }: ApiKeyFieldProps) {
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "save" | "remove", action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
      setDraft("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const status = saved
    ? `Saved key ${saved.hint}`
    : info?.configured
      ? "Configured on the server"
      : "Not configured";

  return (
    <div className="py-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{label}</h3>
        <span className="text-xs text-muted">{status}</span>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void run("save", () => onSave(draft.trim()));
        }}
      >
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy !== null}
            aria-label={`${label} API key`}
            placeholder={saved ? "Paste a new key to replace it" : "Paste your API key"}
            className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-3 font-mono text-sm outline-none transition-colors placeholder:font-sans placeholder:text-faint focus:border-stone-400 focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide key" : "Show key"}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint hover:text-ink"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button type="submit" variant="primary" disabled={!draft.trim() || busy !== null}>
          {busy === "save" && <Spinner />} Save
        </Button>
        {saved && (
          <Button
            variant="danger"
            aria-label={`Remove ${label} key`}
            disabled={busy !== null}
            onClick={() => void run("remove", onRemove)}
          >
            {busy === "remove" && <Spinner />} Remove
          </Button>
        )}
      </form>
      {error && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
    </div>
  );
}
