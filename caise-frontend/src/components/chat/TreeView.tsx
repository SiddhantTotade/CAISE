import { File, Folder } from "lucide-react";
import { memo } from "react";

const BRANCH = /^((?:[│|]\s{2,3}|\s{4})*)[├└][─-]+\s*(.+?)\s*$/;

export interface TreeNode {
  name: string;
  children: TreeNode[];
  isDir: boolean;
}

/**
 * Parses `tree`-style output (├──, └──, │ guides) into nodes. Returns null when the text is not
 * a tree, so ordinary code blocks fall through to the syntax highlighter.
 */
export function parseTree(text: string): TreeNode[] | null {
  const lines = text.replace(/\s+$/, "").split("\n");
  if (lines.length < 2) return null;

  const roots: TreeNode[] = [];
  const stack: { depth: number; node: TreeNode }[] = [];
  let branches = 0;

  for (const [index, line] of lines.entries()) {
    const m = BRANCH.exec(line);
    if (!m) {
      // A single un-prefixed first line is the root label (e.g. "src/").
      if (index === 0 && line.trim()) {
        const root = makeNode(line.trim());
        roots.push(root);
        stack.push({ depth: -1, node: root });
        continue;
      }
      return null;
    }
    branches++;
    const depth = Math.round((m[1] ?? "").length / 4);
    const node = makeNode(m[2] ?? "");
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
      parent.isDir = true;
    } else {
      roots.push(node);
    }
    stack.push({ depth, node });
  }
  return branches >= 2 ? roots : null;
}

function makeNode(raw: string): TreeNode {
  // Drop trailing "# comment" annotations from the name but keep the whole label readable.
  const name = raw.trim();
  return { name, children: [], isDir: name.endsWith("/") };
}

function Node({ node }: { node: TreeNode }) {
  const dir = node.isDir || node.children.length > 0;
  const Icon = dir ? Folder : File;
  return (
    <li>
      <div className="flex items-center gap-2 py-0.5">
        <Icon className={dir ? "size-3.5 shrink-0 text-amber-600" : "size-3.5 shrink-0 text-faint"} />
        <span className={dir ? "font-medium" : "text-stone-700"}>{node.name}</span>
      </div>
      {node.children.length > 0 && (
        <ul className="ml-[7px] border-l border-line pl-4">
          {node.children.map((child, i) => (
            <Node key={`${child.name}-${i}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeViewImpl({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-line bg-stone-50 p-4 font-mono text-[13px]">
      <ul>
        {nodes.map((n, i) => (
          <Node key={`${n.name}-${i}`} node={n} />
        ))}
      </ul>
    </div>
  );
}

export const TreeView = memo(TreeViewImpl);
