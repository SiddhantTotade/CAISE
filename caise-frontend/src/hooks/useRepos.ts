import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { errorMessage } from "../lib/format";
import type { IndexRequest, Repo } from "../lib/types";

const POLL_MS = 2000;

export interface IndexJob {
  taskId: string;
  repoId: string;
  repoUrl: string;
  branch: string;
  state: "running" | "failed";
  error?: string;
}

interface UseRepos {
  repos: Repo[];
  loading: boolean;
  error: string | null;
  /** Active/failed indexing jobs keyed by repo id. */
  jobs: Record<string, IndexJob>;
  reload: () => Promise<void>;
  /** Queues indexing and resolves with the `url@branch` id of the repo being indexed. */
  startIndex: (req: IndexRequest) => Promise<string>;
  remove: (repoId: string) => Promise<void>;
  dismissJob: (repoId: string) => void;
}

export function useRepos(): UseRepos {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, IndexJob>>({});
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const reload = useCallback(async () => {
    try {
      setRepos(await api.repos());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Poll every running job until the worker reports a terminal state.
  const hasRunning = Object.values(jobs).some((j) => j.state === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => {
      void (async () => {
        for (const job of Object.values(jobsRef.current)) {
          if (job.state !== "running") continue;
          try {
            const task = await api.taskStatus(job.taskId);
            const failed = task.status === "FAILURE" || task.result?.status === "error";
            const finished = task.status === "SUCCESS" && !failed;
            if (failed) {
              const message = task.result?.error ?? "Indexing failed";
              setJobs((j) => ({ ...j, [job.repoId]: { ...job, state: "failed", error: message } }));
            } else if (finished) {
              setJobs((j) => {
                const { [job.repoId]: _done, ...rest } = j;
                return rest;
              });
            }
          } catch (e) {
            setJobs((j) => ({ ...j, [job.repoId]: { ...job, state: "failed", error: errorMessage(e) } }));
          }
        }
        // Refresh every tick so a new repo's card (created by the worker) appears while it indexes.
        await reload();
      })();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasRunning, reload]);

  const startIndex = useCallback(async (req: IndexRequest) => {
    const res = await api.indexRepo(req);
    setJobs((j) => ({
      ...j,
      [res.repo_id]: { taskId: res.task_id, repoId: res.repo_id, repoUrl: req.repo_url, branch: req.branch, state: "running" },
    }));
    return res.repo_id;
  }, []);

  const remove = useCallback(
    async (repoId: string) => {
      await api.deleteRepo(repoId);
      await reload();
    },
    [reload],
  );

  const dismissJob = useCallback((repoId: string) => {
    setJobs((j) => {
      const { [repoId]: _gone, ...rest } = j;
      return rest;
    });
  }, []);

  return { repos, loading, error, jobs, reload, startIndex, remove, dismissJob };
}
