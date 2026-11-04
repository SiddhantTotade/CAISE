import { Braces } from "lucide-react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`flex items-center justify-center rounded-xl bg-ink text-white ${big ? "size-11" : "size-8"}`}>
        <Braces className={big ? "size-5" : "size-4"} />
      </span>
      <span className={`font-semibold tracking-tight ${big ? "text-2xl" : "text-base"}`}>CAISE</span>
    </span>
  );
}
