import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * Branch names that exist on the remote for a repository URL (`POST /repos/branches`).
 * Empty until the fetch resolves, and after a failure: callers already list the indexed branches from `/repos`,
 * so a slow or failing remote just means no extra "not indexed" options. Stale requests are aborted.
 */
export function useRemoteBranches(repoUrl: string | null): { names: string[]; loading: boolean } {
  const [result, setResult] = useState<{ repoUrl: string; names: string[] } | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!repoUrl) return;
    const controller = new AbortController();
    setLoadingUrl(repoUrl);
    api
      .branches({ repo_url: repoUrl }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResult({ repoUrl, names: res.branches.map((b) => b.name) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoadingUrl(null);
      });
    return () => controller.abort();
  }, [repoUrl]);

  return {
    names: result && result.repoUrl === repoUrl ? result.names : [],
    loading: loadingUrl !== null && loadingUrl === repoUrl,
  };
}
