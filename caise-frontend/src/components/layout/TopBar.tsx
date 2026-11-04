import { LogOut, Search, Settings, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { IconButton } from "../ui/Button";
import { GithubIcon } from "../ui/GithubIcon";
import { Logo } from "./Logo";

const itemClass =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-stone-50 hover:text-ink";

export function TopBar({ onSearch, query }: { onSearch: (q: string) => void; query: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const submit = (e: FormEvent) => e.preventDefault();

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 md:px-6">
      <Link to="/dashboard" className="md:hidden" aria-label="CAISE home">
        <Logo />
      </Link>

      <form onSubmit={submit} role="search" className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search repositories"
          aria-label="Search repositories"
          className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-sm transition-colors outline-none placeholder:text-faint focus:border-stone-400 focus:bg-surface focus-visible:outline-none"
        />
      </form>

      <div className="ml-auto flex items-center gap-1">
        {!user?.is_guest && (
          <IconButton label="Workspace settings" onClick={() => navigate("/settings")}>
            <Settings className="size-[18px]" />
          </IconButton>
        )}
        {user?.is_guest && (
          <span className="mr-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-muted">Guest</span>
        )}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Account menu"
            className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-line bg-stone-100 transition-colors hover:border-stone-300"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              <UserIcon className="size-4 text-muted" />
            )}
          </button>
          {menu && user && (
            <div role="menu" className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-medium">{user.is_guest ? "Guest" : user.username}</p>
                {!user.is_guest && user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
                {!user.is_guest && user.organizations.length > 0 && (
                  <p className="mt-1 truncate text-xs text-faint">{user.organizations.map((o) => o.name).join(", ")}</p>
                )}
              </div>
              {user.is_guest ? (
                <a href={api.loginUrl()} role="menuitem" className={`mt-1 ${itemClass}`}>
                  <GithubIcon className="size-4" /> Sign in with GitHub
                </a>
              ) : (
                <Link to="/settings" role="menuitem" onClick={() => setMenu(false)} className={`mt-1 ${itemClass}`}>
                  <Settings className="size-4" /> Settings
                </Link>
              )}
              <button type="button" role="menuitem" onClick={() => void signOut()} className={`w-full ${itemClass}`}>
                <LogOut className="size-4" /> {user.is_guest ? "Exit guest session" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
