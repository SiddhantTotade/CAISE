import { isValidElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { TreeView, parseTree } from "./TreeView";

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const TREE_LANGS = new Set(["tree", "text", "txt", "plaintext", ""]);

function buildComponents(streaming: boolean): Components {
  return {
    // Fenced blocks arrive as <pre><code class="language-x">; inline code has no <pre> parent.
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;
      const props = isValidElement<{ className?: string; children?: ReactNode }>(child) ? child.props : {};
      const language = /language-([\w+#-]+)/.exec(props.className ?? "")?.[1];
      const code = textOf(props.children).replace(/\n$/, "");

      if (TREE_LANGS.has(language ?? "")) {
        const tree = parseTree(code);
        if (tree) return <TreeView nodes={tree} />;
      }
      return <CodeBlock code={code} language={language} streaming={streaming} />;
    },
    code({ children, className }) {
      return (
        <code className={className ?? "rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800"}>
          {children}
        </code>
      );
    },
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-muted">
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className="mt-6 mb-3 text-lg font-semibold tracking-tight">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-6 mb-2 text-base font-semibold tracking-tight">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-5 mb-2 text-sm font-semibold">{children}</h3>,
    p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-faint">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-faint">{children}</ol>,
    li: ({ children }) => <li className="leading-7">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-2 border-line pl-4 text-muted">{children}</blockquote>
    ),
    hr: () => <hr className="my-6 border-line" />,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-line bg-stone-50 px-3 py-2 text-left font-medium">{children}</th>
    ),
    td: ({ children }) => <td className="border-b border-line px-3 py-2 last:border-b-0">{children}</td>,
  };
}

const STREAMING_COMPONENTS = buildComponents(true);
const FINAL_COMPONENTS = buildComponents(false);

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const CONTINUATION = /^(?: {2,}|\t)|^(?:[-*+]|\d+[.)])\s/;

/**
 * Splits markdown into top-level blocks at blank lines, never inside a fenced code block.
 * A list stays in one block (loose items and indented continuations rejoin it), so numbering and nesting survive.
 */
function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: { char: string; size: number } | null = null;

  const push = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of text.split("\n")) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.size && line.trim() === marker) fence = null;
    } else if (marker) {
      fence = { char: marker[0]!, size: marker.length };
    }
    if (!fence && line.trim() === "") {
      push();
    } else {
      current.push(line);
    }
  }
  push();

  const merged: string[] = [];
  for (const block of blocks) {
    const prev = merged.at(-1);
    if (prev !== undefined && LIST_ITEM.test(prev) && CONTINUATION.test(block)) merged[merged.length - 1] = `${prev}\n\n${block}`;
    else merged.push(block);
  }
  return merged;
}

const MarkdownBlock = memo(function MarkdownBlock({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={STREAMING_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
});

function MarkdownImpl({ children, streaming = false }: { children: string; streaming?: boolean }) {
  // While streaming only the last block changes, so finished blocks are skipped by MarkdownBlock's memo.
  const blocks = useMemo(() => (streaming ? splitBlocks(children) : []), [streaming, children]);
  if (streaming) {
    return (
      <>
        {blocks.map((block, i) => (
          <MarkdownBlock key={i}>{block}</MarkdownBlock>
        ))}
      </>
    );
  }
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={FINAL_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

export const Markdown = memo(MarkdownImpl);
