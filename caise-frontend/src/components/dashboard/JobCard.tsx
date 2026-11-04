import { GitBranch, X } from "lucide-react";
import type { IndexJob } from "../../hooks/useRepos";
import { parseRepo } from "../../lib/format";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";

/** Placeholder for an indexing job whose repository has no stored record (yet, or because the first run failed). */
export function JobCard({ job, onDismiss, onRetry }: { job: IndexJob; onDismiss: () => void; onRetry: () => void }) {
  const { owner, name } = parseRepo(job.repoUrl);
  const failed = job.state === "failed";
  return (
    <article className="flex flex-col rounded-xl border border-dashed border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium tracking-tight">{name}</h3>
          {owner && <p className="truncate text-xs text-muted">{owner}</p>}
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
            <GitBranch className="size-3.5 shrink-0 text-faint" /> {job.branch}
          </p>
        </div>
        <StatusBadge status={failed ? "failed" : "indexing"} />
      </div>

      {failed ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs break-words text-red-800">
          {job.error ?? "Indexing failed"}
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted">Cloning and indexing. This can take a minute for large repositories.</p>
      )}

      {failed && (
        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
          <Button size="sm" className="flex-1" onClick={onRetry}>Retry</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}><X className="size-3.5" /> Dismiss</Button>
        </div>
      )}
    </article>
  );
}
