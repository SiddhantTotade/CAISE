import clsx from "clsx";
import type { Repo } from "../../lib/types";

const STATUS: Record<Repo["status"], { label: string; dot: string; text: string }> = {
  indexed: { label: "Synced", dot: "bg-emerald-500", text: "text-emerald-700" },
  indexing: { label: "Indexing", dot: "bg-amber-500 animate-pulse", text: "text-amber-700" },
  pending: { label: "Pending", dot: "bg-stone-400", text: "text-muted" },
  failed: { label: "Failed", dot: "bg-red-500", text: "text-red-700" },
};

export function StatusBadge({ status, label }: { status: Repo["status"]; label?: string }) {
  const s = STATUS[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium", s.text)}>
      <span className={clsx("size-1.5 rounded-full", s.dot)} />
      {label ?? s.label}
    </span>
  );
}

const CHANGE = {
  M: { label: "Modified", style: "bg-amber-50 text-amber-700 ring-amber-200" },
  A: { label: "Added", style: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  D: { label: "Deleted", style: "bg-red-50 text-red-700 ring-red-200" },
} as const;

export type ChangeKind = keyof typeof CHANGE;

export function ChangeBadge({ kind }: { kind: ChangeKind }) {
  return (
    <span
      title={CHANGE[kind].label}
      aria-label={CHANGE[kind].label}
      className={clsx(
        "inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold ring-1 ring-inset",
        CHANGE[kind].style,
      )}
    >
      {kind}
    </span>
  );
}
