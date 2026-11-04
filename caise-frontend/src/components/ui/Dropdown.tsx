import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Spinner } from "./Feedback";

export interface DropdownOption {
  value: string;
  label: string;
  /** Secondary line under the label. */
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface DropdownGroup {
  id: string;
  /** Section heading; omit for a single unlabelled list. */
  label?: ReactNode;
  options: DropdownOption[];
}

interface DropdownProps {
  value: string | null;
  onChange: (value: string) => void;
  groups: DropdownGroup[];
  ariaLabel: string;
  placeholder?: string;
  /** Icon shown in the trigger; defaults to the selected option's icon. */
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Which trigger edge the menu is aligned to. */
  align?: "start" | "end";
  /** Classes for the trigger (width limits etc.). */
  className?: string;
}

/** Shared select control: every model / repository / settings picker renders through this. */
export function Dropdown({
  value,
  onChange,
  groups,
  ariaLabel,
  placeholder = "Select",
  icon,
  loading,
  disabled,
  align = "start",
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const uid = useId();

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = flat.find((o) => o.value === value) ?? null;
  const enabled = useCallback((i: number) => flat[i] !== undefined && !flat[i]?.disabled, [flat]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
  }, []);

  const openMenu = () => {
    const at = flat.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(at >= 0 ? at : flat.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close();
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open, close]);

  // Close if the control becomes unusable while open (e.g. a chat starts streaming).
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

  useEffect(() => {
    if (open && highlight >= 0) menu.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < flat.length; i += dir) if (enabled(i)) return i;
    return from;
  };

  const choose = (option: DropdownOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (!open) return openMenu();
        setHighlight((h) => step(h, e.key === "ArrowDown" ? 1 : -1));
        break;
      case "Home":
      case "End":
        if (!open) return;
        e.preventDefault();
        setHighlight(e.key === "Home" ? step(-1, 1) : step(flat.length, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) return openMenu();
        if (enabled(highlight)) choose(flat[highlight]!);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation(); // consumed here: an enclosing dialog must not also close on this Escape
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  };

  const shownIcon = icon ?? selected?.icon;
  let index = -1;

  return (
    <div ref={root} className="relative inline-block min-w-0 max-w-full">
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-activedescendant={open && highlight >= 0 ? `${uid}-opt-${highlight}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={clsx(
          "inline-flex h-9 w-full items-center gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-colors",
          open ? "border-stone-400 shadow-sm" : "border-line hover:bg-stone-50",
          "disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-faint",
          className,
        )}
      >
        {loading ? <Spinner /> : shownIcon && <span className="shrink-0 text-muted [&>svg]:size-4">{shownIcon}</span>}
        <span className={clsx("min-w-0 flex-1 truncate", selected ? "font-medium" : "text-faint")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={clsx("size-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={menu}
          id={`${uid}-menu`}
          role="listbox"
          aria-label={ariaLabel}
          className={clsx(
            "dropdown-pop absolute z-30 mt-1.5 max-h-80 w-max min-w-full max-w-[22rem] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {flat.length === 0 && <p className="px-2.5 py-2 text-sm text-faint">Nothing to choose from</p>}
          {groups.map((g, gi) => (
            <div key={g.id} className={clsx(gi > 0 && "mt-1 border-t border-line pt-1")}>
              {g.label && (
                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-faint">
                  <span className="inline-flex items-center gap-1.5">{g.label}</span>
                </div>
              )}
              {g.options.map((o) => {
                index += 1;
                const i = index;
                const active = o.value === value;
                return (
                  <div
                    key={o.value}
                    id={`${uid}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={active}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => enabled(i) && setHighlight(i)}
                    onMouseDown={(e) => e.preventDefault()} // keep focus on the trigger
                    onClick={() => choose(o)}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                      o.disabled ? "cursor-not-allowed text-faint" : "cursor-pointer",
                      !o.disabled && highlight === i && "bg-stone-100",
                      active && "font-medium",
                    )}
                  >
                    {o.icon && <span className="shrink-0 text-muted [&>svg]:size-4">{o.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.description && <span className="block truncate text-xs font-normal text-muted">{o.description}</span>}
                    </span>
                    {active && <Check className="size-4 shrink-0" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
