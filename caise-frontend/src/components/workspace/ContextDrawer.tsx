import clsx from "clsx";
import { ChevronRight, FileCode, FolderOpen, PanelRightClose } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { basename, dirname, errorMessage, shortHash } from "../../lib/format";
import type { Repo, RepoFiles, Source } from "../../lib/types";
import { IconButton } from "../ui/Button";
import { ErrorNotice, Spinner } from "../ui/Feedback";
import { ChangeBadge, type ChangeKind } from "../ui/StatusBadge";

interface DrawerProps {
  repo: Repo | null;
  /** Snippets retrieved for the latest answer. */
  sources: Source[];
  onClose: () => void;
}

const ORDER: ChangeKind[] = ["M", "A", "D"];
const SHOWN_PER_GROUP = 200;
const SHOWN_FILES = 300;

function FileRow({ path, kind, lines }: { path: string; kind?: ChangeKind; lines?: string }) {
  const dir = dirname(path);
  return (
    <li className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-stone-50" title={path}>
      {kind ? <ChangeBadge kind={kind} /> : <FileCode className="size-4 shrink-0 text-faint" />}
      <span className="min-w-0 flex-1">
        <span className={clsx("block truncate font-mono text-xs", kind === "D" && "text-faint line-through")}>
          {basename(path)}
          {lines && <span className="text-faint"> {lines}</span>}
        </span>
        {dir && <span className="block truncate text-[11px] text-faint">{dir}</span>}
      </span>
    </li>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="px-3 py-4">
      <h3 className="mb-2 flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        {title}
        {count !== undefined && <span className="font-mono normal-case">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

type FilesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: RepoFiles };

/** Every file indexed for the repo; reloaded whenever the index is updated. */
function useRepoFiles(repoId: string | undefined, updatedAt: string | null | undefined, status: string | undefined) {
  const [state, setState] = useState<FilesState>({ status: "idle" });

  useEffect(() => {
    if (!repoId) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    api
      .repoFiles(repoId, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [repoId, updatedAt, status]);

  return state;
}

export function ContextDrawer({ repo, sources, onClose }: DrawerProps) {
  const files = useRepoFiles(repo?.repo_id, repo?.updated_at, repo?.status);

  // Merge several snippets from one file into a single row.
  const used = useMemo(() => {
    const byFile = new Map<string, string[]>();
    for (const s of sources) {
      const key = `${s.repo_id}\u0000${s.file_path}`;
      byFile.set(key, [...(byFile.get(key) ?? []), `L${s.start_line}-${s.end_line}`]);
    }
    return [...byFile.entries()].map(([key, ranges]) => ({ path: key.split("\u0000")[1]!, lines: ranges.join(", ") }));
  }, [sources]);

  const changes = repo?.changes;
  const groups: Record<ChangeKind, string[]> = {
    M: changes?.modified ?? [],
    A: changes?.added ?? [],
    D: changes?.deleted ?? [],
  };
  const totalChanges = ORDER.reduce((n, k) => n + groups[k].length, 0);

  return (
    <aside aria-label="Context" className="flex h-full w-80 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-5">
        <h2 className="text-sm font-medium">Context</h2>
        <IconButton label="Collapse context panel" onClick={onClose}>
          <PanelRightClose className="size-[18px]" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        <Section title="Files analyzed" count={files.status === "ready" ? files.data.total : undefined}>
          {!repo ? (
            <p className="px-2 text-xs text-faint">Select a repository to see the files indexed for it.</p>
          ) : files.status === "error" ? (
            <ErrorNotice>{files.message}</ErrorNotice>
          ) : files.status !== "ready" ? (
            <div className="flex justify-center py-4 text-muted"><Spinner /></div>
          ) : files.data.files.length === 0 ? (
            <p className="px-2 text-xs text-faint">No files have been indexed yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {files.data.files.slice(0, SHOWN_FILES).map((f) => (
                <FileRow key={f.path} path={f.path} />
              ))}
              {files.data.total > SHOWN_FILES && (
                <li className="px-2 py-1 text-[11px] text-faint">+{files.data.total - SHOWN_FILES} more</li>
              )}
            </ul>
          )}
        </Section>

        <Section title="Used in latest answer" count={used.length}>
          {used.length === 0 ? (
            <p className="px-2 text-xs text-faint">Files retrieved to answer your latest question will appear here.</p>
          ) : (
            <ul>
              {used.map((f) => (
                <FileRow key={f.path} path={f.path} lines={f.lines} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Latest changes" count={repo ? totalChanges : undefined}>
          {!repo ? (
            <p className="px-2 text-xs text-faint">Select a repository to see what changed in the last sync.</p>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-1.5 px-2 text-[11px] text-faint">
                <FolderOpen className="size-3" />
                <span className="font-mono">{shortHash(repo.last_index_commit)}</span>
                <ChevronRight className="size-3" />
                <span>{changes?.mode ?? "no sync yet"}</span>
              </p>
              {totalChanges === 0 ? (
                <p className="px-2 text-xs text-faint">No file changes recorded.</p>
              ) : (
                ORDER.filter((k) => groups[k].length > 0).map((kind) => (
                  <ul key={kind} className="mb-2">
                    {groups[kind].slice(0, SHOWN_PER_GROUP).map((p) => (
                      <FileRow key={`${kind}-${p}`} path={p} kind={kind} />
                    ))}
                    {groups[kind].length > SHOWN_PER_GROUP && (
                      <li className="px-2 py-1 text-[11px] text-faint">
                        +{groups[kind].length - SHOWN_PER_GROUP} more
                      </li>
                    )}
                  </ul>
                ))
              )}
            </>
          )}
        </Section>
      </div>
    </aside>
  );
}
