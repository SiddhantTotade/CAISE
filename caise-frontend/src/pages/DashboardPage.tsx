import { FolderGit2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppContext } from "../components/layout/AppLayout";
import { AddRepoDialog } from "../components/dashboard/AddRepoDialog";
import { JobCard } from "../components/dashboard/JobCard";
import { RepoCard } from "../components/dashboard/RepoCard";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorNotice, Spinner } from "../components/ui/Feedback";
import { errorMessage } from "../lib/format";

export function DashboardPage() {
  const { repos, loading, error, jobs, query, startIndex, remove, dismissJob } = useAppContext();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? repos.filter((r) => r.repo_url.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q)) : repos;
  }, [repos, query]);

  // Jobs with no stored repo: just submitted, or a first run that failed (the backend discards those).
  const orphanJobs = useMemo(() => {
    const known = new Set(repos.map((r) => r.repo_id));
    return Object.values(jobs).filter((j) => !known.has(j.repoId));
  }, [jobs, repos]);

  const refresh = async (repoUrl: string, branch: string) => {
    setActionError(null);
    try {
      await startIndex({ repo_url: repoUrl, branch });
    } catch (e) {
      setActionError(errorMessage(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
            <p className="mt-1 text-sm text-muted">Connected codebases you can search and ask questions about.</p>
          </div>
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add repository
          </Button>
        </div>

        <div className="mt-8 space-y-4">
          {error && <ErrorNotice>{error}</ErrorNotice>}
          {actionError && <ErrorNotice>{actionError}</ErrorNotice>}

          {loading ? (
            <div className="flex justify-center py-24 text-muted"><Spinner className="size-6" /></div>
          ) : visible.length === 0 && orphanJobs.length === 0 ? (
            <EmptyState icon={<FolderGit2 />} title={query ? "No matching repositories" : "No repositories yet"}>
              {query ? "Try a different search." : "Connect a GitHub repository to start asking questions about your code."}
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {orphanJobs.map((job) => (
                <JobCard
                  key={job.repoId}
                  job={job}
                  onDismiss={() => dismissJob(job.repoId)}
                  onRetry={() => {
                    dismissJob(job.repoId);
                    void refresh(job.repoUrl, job.branch);
                  }}
                />
              ))}
              {visible.map((repo) => (
                <RepoCard
                  key={repo.repo_id}
                  repo={repo}
                  job={jobs[repo.repo_id]}
                  onRefresh={() => void refresh(repo.repo_url, repo.branch)}
                  onDelete={() => remove(repo.repo_id).catch((e: unknown) => setActionError(errorMessage(e)))}
                  onDismissJob={() => dismissJob(repo.repo_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {adding && <AddRepoDialog onClose={() => setAdding(false)} onSubmit={startIndex} />}
    </div>
  );
}
