import clsx from "clsx";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("size-4 animate-spin", className)} aria-label="Loading" />;
}

export function ErrorNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={clsx(
        "flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 text-faint [&>svg]:size-8">{icon}</div>
      <h3 className="text-sm font-medium">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <Spinner className="size-6" />
    </div>
  );
}
