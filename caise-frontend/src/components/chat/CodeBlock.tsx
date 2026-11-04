import { Check, Copy } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { highlight } from "../../lib/highlight";

type CopyState = "idle" | "copied" | "failed";

function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

interface CodeBlockProps {
  code: string;
  language?: string;
  /** While the answer is still streaming, skip syntax detection (it flickers on partial code). */
  streaming?: boolean;
}

function CodeBlockImpl({ code, language, streaming }: CodeBlockProps) {
  const [copied, setCopied] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const { html, language: detected } = useMemo(
    () => (streaming && !language ? { html: null, language: "text" } : highlight(code, language)),
    [code, language, streaming],
  );

  const flash = (state: CopyState) => {
    setCopied(state);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied("idle"), 1600);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      flash("copied");
    } catch {
      // Clipboard API needs a secure context and permission; fall back to the legacy selection copy.
      flash(legacyCopy(code) ? "copied" : "failed");
    }
  };

  return (
    <figure className="group my-4 overflow-hidden rounded-xl border border-stone-800 bg-code-bg">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-xs text-zinc-400">{language ?? detected}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          {copied === "copied" ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied === "copied" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        {html === null ? (
          <code className="hljs font-mono">{code}</code>
        ) : (
          <code className="hljs font-mono" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
    </figure>
  );
}

export const CodeBlock = memo(CodeBlockImpl);
