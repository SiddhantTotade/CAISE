import { FolderGit2, GitBranch, MessagesSquare, PanelRightOpen, Plus, SquarePen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AddRepoDialog } from "../components/dashboard/AddRepoDialog";
import { Composer } from "../components/chat/Composer";
import { MessageList } from "../components/chat/MessageList";
import { ModelSelector } from "../components/chat/ModelSelector";
import { useAppContext } from "../components/layout/AppLayout";
import { ContextDrawer } from "../components/workspace/ContextDrawer";
import { Button, IconButton } from "../components/ui/Button";
import { Dropdown, type DropdownGroup } from "../components/ui/Dropdown";
import { EmptyState, ErrorNotice, Spinner } from "../components/ui/Feedback";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useChat } from "../hooks/useChat";
import { useModels } from "../hooks/useModels";
import { useRemoteBranches } from "../hooks/useRemoteBranches";
import { errorMessage, parseRepo } from "../lib/format";
import type { Repo } from "../lib/types";

const NEW_BRANCH = "new:"; // repo ids start with the URL scheme, so this prefix never collides

const byUpdated = (a: Repo, b: Repo): number =>
  new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();

export function WorkspacePage() {
  const { repos, loading: reposLoading, jobs, startIndex, dismissJob, chatList } = useAppContext();
  const { user } = useAuth();
  const { prefs, updatePrefs } = useSettings();
  const { catalog, loading, error: modelsError, selection, provider, select } = useModels();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  /** A branch we just started indexing: selected as soon as it is ready. */
  const [awaiting, setAwaiting] = useState<string | null>(null);

  const chatId = params.get("chat");
  const repoParam = params.get("repo");

  const { refresh: refreshChats } = chatList;
  // The repo in use is pinned to the URL together with the new chat, so it cannot drift to a different default.
  const activeRepoId = useRef<string | undefined>(undefined);
  const onChatCreated = useCallback(
    (id: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("chat", id);
          if (activeRepoId.current) next.set("repo", activeRepoId.current);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const { messages, busy, loading: chatLoading, loadError, loadedChat, send, stop, reset } = useChat({
    chatId,
    onChatCreated,
    onSettled: refreshChats,
  });

  // Repository: ?repo=, else the repo of the chat being restored, else the most recently updated one.
  const repo = useMemo<Repo | null>(() => {
    const usable = repos.filter((r) => r.status !== "failed");
    const byId = (id: string | null | undefined) => (id ? (repos.find((r) => r.repo_id === id) ?? null) : null);
    const explicit = byId(repoParam);
    if (explicit) return explicit;
    if (chatLoading) return null; // restoring a chat: don't flash the default repo
    const fromChat = byId(loadedChat?.id === chatId ? loadedChat?.repoId : null);
    if (fromChat) return fromChat;
    return [...usable].sort((a, b) => Number(b.status === "indexed") - Number(a.status === "indexed") || byUpdated(a, b))[0] ?? null;
  }, [repos, repoParam, chatId, loadedChat, chatLoading]);

  // Drop a ?repo= that no longer exists (deleted, or access revoked) once repos have loaded.
  useEffect(() => {
    if (repoParam && !reposLoading && !repos.some((r) => r.repo_id === repoParam)) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("repo");
          return next;
        },
        { replace: true },
      );
    }
  }, [repoParam, reposLoading, repos, setParams]);

  const selectRepo = useCallback(
    (repoId: string) => {
      setAwaiting(null);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("repo", repoId);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Auto-select a branch once the indexing job we started for it has finished.
  useEffect(() => {
    if (!awaiting) return;
    if (jobs[awaiting]?.state === "failed") {
      setAwaiting(null);
    } else if (!jobs[awaiting] && repos.some((r) => r.repo_id === awaiting && r.status === "indexed")) {
      selectRepo(awaiting);
    }
  }, [awaiting, jobs, repos, selectRepo]);

  // One entry per repository URL, newest first.
  const repoUrls = useMemo(() => {
    const seen = new Map<string, Repo>();
    for (const r of [...repos].sort(byUpdated)) if (!seen.has(r.repo_url)) seen.set(r.repo_url, r);
    return [...seen.values()];
  }, [repos]);

  const repoGroups = useMemo<DropdownGroup[]>(
    () => [
      {
        id: "repos",
        options: repoUrls.map((r) => {
          const { owner, name } = parseRepo(r.repo_url);
          return { value: r.repo_url, label: name, description: owner || undefined };
        }),
      },
    ],
    [repoUrls],
  );

  const repoUrl = repo?.repo_url ?? null;
  const sameUrl = useMemo(() => (repoUrl ? repos.filter((r) => r.repo_url === repoUrl).sort(byUpdated) : []), [repos, repoUrl]);
  const remote = useRemoteBranches(repoUrl);

  const branchGroups = useMemo<DropdownGroup[]>(() => {
    const known = new Set(sameUrl.map((r) => r.branch));
    const groups: DropdownGroup[] = [
      {
        id: "indexed",
        label: "Indexed",
        options: sameUrl.map((r) => ({
          value: r.repo_id,
          label: r.branch,
          description: r.status === "indexed" ? undefined : r.status,
          disabled: r.status === "failed",
        })),
      },
    ];
    const notIndexed = remote.names.filter((n) => !known.has(n));
    if (notIndexed.length > 0) {
      groups.push({
        id: "remote",
        label: "Not indexed",
        options: notIndexed.map((n) => ({ value: `${NEW_BRANCH}${n}`, label: n, description: "Select to index" })),
      });
    }
    return groups;
  }, [sameUrl, remote.names]);

  const chooseBranch = async (value: string) => {
    if (!value.startsWith(NEW_BRANCH) || !repoUrl) return selectRepo(value);
    setIndexError(null);
    try {
      setAwaiting(await startIndex({ repo_url: repoUrl, branch: value.slice(NEW_BRANCH.length) }));
    } catch (e) {
      setIndexError(errorMessage(e));
    }
  };

  const indexing = Object.values(jobs).filter((j) => j.state === "running" && j.repoUrl === repoUrl);
  const failedJobs = Object.values(jobs).filter((j) => j.state === "failed" && j.repoUrl === repoUrl);

  const latestSources = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant" && m.sources)?.sources ?? [],
    [messages],
  );

  const guest = Boolean(user?.is_guest);
  const ready = Boolean(selection) && Boolean(provider?.configured);
  const needsRepo = prefs.useContext && !repo;
  const keyHint = selection && provider && !ready ? provider.id : null;

  const onSend = (text: string) => {
    if (!selection || needsRepo) return;
    activeRepoId.current = prefs.useContext ? repo?.repo_id : undefined;
    void send(text, {
      selection,
      repoId: activeRepoId.current,
      useContext: prefs.useContext,
      limit: prefs.contextSnippets,
    });
  };

  const newChat = () => {
    reset();
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("chat");
        return next;
      },
      { replace: true },
    );
  };

  const drawerOpen = prefs.openContextDrawer;
  const scope = repo ? `${parseRepo(repo.repo_url).name} (${repo.branch})` : "your code";
  const noRepos = !reposLoading && repos.length === 0;

  let placeholder = `Ask about ${scope}…`;
  if (!ready) placeholder = "Choose a configured model to start";
  else if (needsRepo) placeholder = "Select a repository and branch to start";

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 md:px-6">
          <ModelSelector catalog={catalog} loading={loading} selection={selection} onSelect={select} disabled={busy} />

          {repoUrls.length > 0 && (
            <>
              <Dropdown
                ariaLabel="Repository"
                value={repoUrl}
                groups={repoGroups}
                icon={<FolderGit2 />}
                placeholder="Select repository"
                disabled={busy}
                className="max-w-[14rem]"
                onChange={(url) => {
                  const target = repos.filter((r) => r.repo_url === url && r.status !== "failed").sort(byUpdated);
                  const pick = target.find((r) => r.status === "indexed") ?? target[0];
                  if (pick) selectRepo(pick.repo_id);
                }}
              />
              <Dropdown
                ariaLabel="Branch"
                value={repo?.repo_id ?? null}
                groups={branchGroups}
                icon={<GitBranch />}
                placeholder="Select branch"
                loading={remote.loading || indexing.length > 0}
                disabled={busy || !repo}
                className="max-w-[12rem]"
                onChange={(v) => void chooseBranch(v)}
              />
              {indexing.length > 0 && (
                <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Spinner className="size-3.5" /> Indexing {indexing.map((j) => j.branch).join(", ")}…
                </span>
              )}
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            {(messages.length > 0 || chatId) && (
              <Button size="sm" variant="ghost" onClick={newChat}>
                <SquarePen className="size-3.5" /> New chat
              </Button>
            )}
            {!drawerOpen && (
              <IconButton label="Open context panel" onClick={() => updatePrefs({ openContextDrawer: true })}>
                <PanelRightOpen className="size-[18px]" />
              </IconButton>
            )}
          </div>
        </div>

        {modelsError && <ErrorNotice className="m-4">Could not load models: {modelsError}</ErrorNotice>}
        {loadError && <ErrorNotice className="m-4">Could not load this chat: {loadError}</ErrorNotice>}
        {indexError && <ErrorNotice className="mx-4 mt-4">{indexError}</ErrorNotice>}
        {failedJobs.map((j) => (
          <ErrorNotice key={j.repoId} className="mx-4 mt-4">
            <span className="flex items-start justify-between gap-3">
              <span>Indexing {j.branch} failed: {j.error ?? "unknown error"}</span>
              <button type="button" aria-label="Dismiss" onClick={() => dismissJob(j.repoId)} className="shrink-0 text-red-400 hover:text-red-700">
                <X className="size-3.5" />
              </button>
            </span>
          </ErrorNotice>
        ))}
        {keyHint && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {guest ? (
              <>No API key is configured for this provider on the server — pick another model.</>
            ) : (
              <>
                {keyHint} has no API key configured on the server.{" "}
                <Link to="/settings" className="font-medium underline">Add your own key in Settings</Link> or pick another model.
              </>
            )}
          </div>
        )}

        {chatLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-muted"><Spinner className="size-6" /></div>
        ) : messages.length > 0 ? (
          <MessageList messages={messages} />
        ) : noRepos ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
            <EmptyState icon={<FolderGit2 />} title="No repositories yet">
              Add a GitHub repository to ask questions grounded in its code.
              <div className="mt-4 flex justify-center">
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Add repository
                </Button>
              </div>
              {Object.values(jobs).some((j) => j.state === "running") && (
                <p role="status" className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
                  <Spinner className="size-3.5" /> Indexing in progress…
                </p>
              )}
            </EmptyState>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-line bg-surface text-muted">
              <MessagesSquare className="size-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Ask about {scope}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              {prefs.useContext
                ? "Answers are grounded in your indexed code, with the files used shown alongside."
                : "Context retrieval is off, so this is a plain conversation with the model."}
            </p>
          </div>
        )}

        <Composer busy={busy} disabled={!ready || needsRepo} placeholder={placeholder} onSend={onSend} onStop={stop} />
      </section>

      {drawerOpen && (
        <ContextDrawer repo={repo} sources={latestSources} onClose={() => updatePrefs({ openContextDrawer: false })} />
      )}

      {adding && <AddRepoDialog onClose={() => setAdding(false)} onSubmit={startIndex} />}
    </div>
  );
}
