import { GitBranch, KeyRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/format";
import type { BranchesResponse, IndexRequest } from "../../lib/types";
import { Button, IconButton } from "../ui/Button";
import { Dropdown, type DropdownGroup } from "../ui/Dropdown";
import { ErrorNotice, Spinner } from "../ui/Feedback";

interface AddRepoDialogProps {
  onClose: () => void;
  onSubmit: (req: IndexRequest) => Promise<unknown>;
}

const field =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-stone-400 focus-visible:outline-none";

export function AddRepoDialog({ onClose, onSubmit }: AddRepoDialogProps) {
  const { user } = useAuth();
  const guest = Boolean(user?.is_guest);
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState<BranchesResponse | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  useEffect(() => () => request.current?.abort(), []);

  // Branches belong to the URL (and token) they were loaded for; editing either discards them.
  const invalidate = () => {
    request.current?.abort();
    request.current = null;
    setLoaded(null);
    setBranch(null);
    setLoadingBranches(false);
    setError(null);
  };

  const trimmedUrl = repoUrl.trim();
  const trimmedToken = guest ? "" : token.trim();

  const loadBranches = async () => {
    if (!trimmedUrl || loadingBranches) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoadingBranches(true);
    setError(null);
    try {
      const res = await api.branches(
        { repo_url: trimmedUrl, ...(trimmedToken && { access_token: trimmedToken }) },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLoaded(res);
      const names = res.branches.map((b) => b.name);
      setBranch(res.default_branch && names.includes(res.default_branch) ? res.default_branch : (names[0] ?? null));
    } catch (e) {
      if (!controller.signal.aborted) setError(errorMessage(e));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoadingBranches(false);
      }
    }
  };

  const groups = useMemo<DropdownGroup[]>(
    () => [
      {
        id: "branches",
        options: (loaded?.branches ?? []).map((b) => ({
          value: b.name,
          label: b.name,
          description: b.indexed ? "Already indexed" : undefined,
        })),
      },
    ],
    [loaded],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loaded || !branch) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        repo_url: loaded.repo_url,
        branch,
        ...(trimmedToken && { access_token: trimmedToken }),
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-repo-title"
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="add-repo-title" className="text-base font-semibold tracking-tight">Connect a repository</h2>
            <p className="mt-1 text-sm text-muted">It is cloned, parsed and indexed in the background.</p>
          </div>
          <IconButton label="Close" onClick={onClose} disabled={busy} className="-mt-1 -mr-2">
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Repository URL</span>
            <input
              ref={first}
              required
              type="url"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                invalidate();
              }}
              onBlur={(e) => !loaded && !error && !(e.relatedTarget instanceof HTMLButtonElement) && void loadBranches()}
              onKeyDown={(e) => {
                // The submit button is disabled until branches are loaded, so Enter must be handled here.
                if (e.key === "Enter" && !loaded) {
                  e.preventDefault();
                  void loadBranches();
                }
              }}
              placeholder="https://github.com/owner/repo"
              className={field}
            />
          </label>

          {guest ? (
            <p className="text-xs text-muted">Public GitHub repositories only.</p>
          ) : (
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <KeyRound className="size-3" /> GitHub token <span className="font-normal text-faint">(private repos only)</span>
              </span>
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  invalidate();
                }}
                placeholder="ghp_…"
                className={field}
              />
              <span className="mt-1.5 block text-[11px] text-faint">Used for this run only. It is never stored.</span>
            </label>
          )}

          {!loaded && (
            <Button className="w-full" onClick={() => void loadBranches()} disabled={!trimmedUrl || loadingBranches}>
              {loadingBranches && <Spinner />} Load branches
            </Button>
          )}

          {loaded && (
            <div>
              <span className="mb-1.5 block text-xs font-medium">Branch</span>
              <Dropdown
                ariaLabel="Branch"
                value={branch}
                groups={groups}
                icon={<GitBranch />}
                placeholder="Select a branch"
                disabled={busy}
                className="w-full"
                onChange={setBranch}
              />
              {loaded.remote_error && (
                <ErrorNotice className="mt-3">
                  Could not reach the remote ({loaded.remote_error}). Only already indexed branches are listed.
                </ErrorNotice>
              )}
            </div>
          )}

          {error && <ErrorNotice>{error}</ErrorNotice>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy || !loaded || !branch}>
            {busy && <Spinner />} Connect
          </Button>
        </div>
      </form>
    </div>
  );
}
