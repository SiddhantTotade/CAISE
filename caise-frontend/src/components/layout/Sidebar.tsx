import clsx from "clsx";
import { Clock, FolderGit2, LayoutDashboard, MessageSquare, MessagesSquare, Plus, Settings, Trash2 } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import type { UseChats } from "../../hooks/useChats";
import type { useRepos } from "../../hooks/useRepos";
import { parseRepo, timeAgo } from "../../lib/format";
import { IconButton } from "../ui/Button";
import { Logo } from "./Logo";

const NAV = [
  { to: "/dashboard", label: "Repositories", icon: LayoutDashboard },
  { to: "/workspace", label: "Workspace", icon: MessagesSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const RECENT_COUNT = 4;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive ? "bg-stone-100 font-medium text-ink" : "text-muted hover:bg-stone-50 hover:text-ink",
  );

const sectionTitle = "flex items-center gap-1.5 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-faint";

interface SidebarProps {
  repos: ReturnType<typeof useRepos>["repos"];
  chatList: UseChats;
}

export function Sidebar({ repos, chatList }: SidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const activeChat = location.pathname === "/workspace" ? params.get("chat") : null;
  const nav = user?.is_guest ? NAV.filter((n) => n.to !== "/settings") : NAV;

  const recent = [...repos]
    .filter((r) => r.updated_at)
    .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
    .slice(0, RECENT_COUNT);

  const removeChat = async (chatId: string) => {
    try {
      await chatList.remove(chatId);
      if (chatId === activeChat) navigate("/workspace", { replace: true });
    } catch {
      /* the chat stays listed; nothing was deleted */
    }
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex h-14 items-center px-5">
        <Logo />
      </div>

      <nav className="space-y-0.5 px-3 pt-2" aria-label="Primary">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className={linkClass}>
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        <section aria-label="Chats">
          <h2 className={clsx(sectionTitle, "justify-between")}>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="size-3" /> Chats
            </span>
            <IconButton label="New chat" className="-my-1.5 -mr-1.5 size-6" onClick={() => navigate("/workspace")}>
              <Plus className="size-3.5" />
            </IconButton>
          </h2>
          {chatList.chats.length === 0 ? (
            <p className="px-3 text-xs text-faint">{chatList.loading ? "Loading chats…" : "Your conversations will appear here."}</p>
          ) : (
            <ul className="space-y-0.5">
              {chatList.chats.map((c) => (
                <li key={c.id} className="group relative">
                  <Link
                    to={`/workspace?chat=${encodeURIComponent(c.id)}`}
                    className={clsx(
                      "block rounded-lg py-2 pr-9 pl-3 transition-colors",
                      c.id === activeChat ? "bg-stone-100" : "hover:bg-stone-50",
                    )}
                    aria-current={c.id === activeChat ? "page" : undefined}
                  >
                    <span className={clsx("block truncate text-sm", c.id === activeChat && "font-medium")}>{c.title}</span>
                    <span className="mt-0.5 block text-[11px] text-faint">{timeAgo(c.updated_at)}</span>
                  </Link>
                  <IconButton
                    label={`Delete chat ${c.title}`}
                    className="absolute top-1/2 right-1 size-7 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => void removeChat(c.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section aria-label="Recent activity">
            <h2 className={sectionTitle}>
              <Clock className="size-3" /> Recent activity
            </h2>
            <ul className="space-y-0.5">
              {recent.map((r) => (
                <li key={r.repo_id}>
                  <NavLink
                    to={`/workspace?repo=${encodeURIComponent(r.repo_id)}`}
                    className="block rounded-lg px-3 py-2 transition-colors hover:bg-stone-50"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <FolderGit2 className="size-3.5 shrink-0 text-faint" />
                      <span className="truncate">{parseRepo(r.repo_url).name}</span>
                      <span className="shrink-0 rounded bg-stone-100 px-1.5 py-px font-mono text-[10px] text-muted">{r.branch}</span>
                    </span>
                    <span className="mt-0.5 block pl-[22px] text-[11px] text-faint">{timeAgo(r.updated_at)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
