const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const shortHash = (hash: string | null): string => (hash ? hash.slice(0, 7) : "-");

/** "https://github.com/acme/demo" -> { owner: "acme", name: "demo" } */
export function parseRepo(repoUrl: string): { owner: string; name: string } {
  const parts = repoUrl.replace(/\/+$/, "").replace(/\.git$/, "").split("/");
  return { name: parts.at(-1) ?? repoUrl, owner: parts.length > 4 ? (parts.at(-2) ?? "") : "" };
}

export const basename = (path: string): string => path.split("/").at(-1) ?? path;
export const dirname = (path: string): string => path.split("/").slice(0, -1).join("/");

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
