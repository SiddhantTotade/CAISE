import { GitBranch, GitCommitHorizontal, MessagesSquare, RefreshCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { IndexJob } from "../../hooks/useRepos";
import { parseRepo, shortHash, timeAgo } from "../../lib/format";
import type { Repo } from "../../lib/types";
import { Button, IconButton } from "../ui/Button";
import { Spinner } from "../ui/Feedback";
import { StatusBadge } from "../ui/StatusBadge";

interface RepoCardProps {
  repo: Repo;
  job?: IndexJob;
  onRefresh: () => void;
  onDelete: () => Promise<void>;
  onDismissJob: () => void;
}

export function RepoCard({ repo, job, onRefresh, onDelete, onDismissJob }: RepoCardProps) {
  const { owner, name } = parseRepo(repo.repo_url);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const running = job?.state === "running";
  const status = running ? "indexing" : repo.status;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <article className="flex flex-col rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium tracking-tight">{name}</h3>
          {owner && <p className="truncate text-xs text-muted">{owner}</p>}
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="mt-5 space-y-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          <GitBranch className="size-3.5 text-faint" />
          <dt className="sr-only">Branch</dt>
          <dd className="truncate">{repo.branch}</dd>
        </div>
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="size-3.5 text-faint" />
          <dt className="sr-only">Commit</dt>
          <dd className="font-mono">{shortHash(repo.last_index_commit)}</dd>
          <dd className="text-faint">· updated {timeAgo(repo.updated_at)}</dd>
        </div>
      </dl>

      {job?.state === "failed" && (
        <p role="alert" className="mt-4 flex items-start justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          <span className="break-words">{job.error ?? "Indexing failed"}</span>
          <button type="button" onClick={onDismissJob} aria-label="Dismiss" className="shrink-0 text-red-400 hover:text-red-700">
            <X className="size-3.5" />
          </button>
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <Link
          to={`/workspace?repo=${encodeURIComponent(repo.repo_id)}`}
          className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-xs font-medium text-white transition-colors hover:bg-stone-700"
        >
          <MessagesSquare className="size-3.5" /> Ask
        </Link>
        <Button size="sm" onClick={onRefresh} disabled={running}>
          {running ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
          {running ? "Indexing" : "Refresh"}
        </Button>
        {repo.is_owner &&
          (confirming ? (
            <Button size="sm" variant="danger" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Spinner className="size-3.5" /> : "Delete?"}
            </Button>
          ) : (
            <IconButton label="Delete repository" className="size-8" onClick={() => setConfirming(true)} onBlur={() => !deleting && setConfirming(false)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          ))}
      </div>
    </article>
  );
}
