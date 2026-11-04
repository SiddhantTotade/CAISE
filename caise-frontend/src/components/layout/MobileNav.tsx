import clsx from "clsx";
import { LayoutDashboard, MessagesSquare, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ITEMS = [
  { to: "/dashboard", label: "Repos", icon: LayoutDashboard },
  { to: "/workspace", label: "Workspace", icon: MessagesSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Replaces the sidebar below the md breakpoint. */
export function MobileNav() {
  const { user } = useAuth();
  const items = user?.is_guest ? ITEMS.filter((i) => i.to !== "/settings") : ITEMS;
  return (
    <nav aria-label="Primary" className="flex shrink-0 border-t border-line bg-surface md:hidden">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors",
              isActive ? "font-medium text-ink" : "text-muted",
            )
          }
        >
          <Icon className="size-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
