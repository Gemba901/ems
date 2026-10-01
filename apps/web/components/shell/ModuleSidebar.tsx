"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, PanelLeft, type LucideIcon } from "lucide-react";

// Shared shell sidebar for every module (main app, DWMS, Kaizen, SGA, SIMS, Leave, Admin).
// Expanded: a 256px panel with grouped links. Collapsed (desktop): an 88px rail that keeps
// each icon's label visible underneath it. Layouts pad their content with SIDEBAR_PADDING.

export const SIDEBAR_PADDING = {
  collapsed: "lg:pl-[88px]",
  expanded: "lg:pl-64",
} as const;

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Short label for the collapsed rail; falls back to `label`. */
  shortLabel?: string;
  /** Match the path exactly instead of treating it as a prefix. */
  exact?: boolean;
}

export interface SidebarNavGroup {
  name: string;
  items: SidebarNavItem[];
}

export interface SidebarAction {
  label: string;
  href: string;
  icon: LucideIcon;
  shortLabel?: string;
  variant?: "primary" | "secondary";
}

interface ModuleSidebarProps {
  /** DOM id for the panel, used by the toggle buttons' aria-controls. */
  id: string;
  title: string;
  subtitle?: string;
  homeHref: string;
  /** Optional mark shown before the title (e.g. organization logo). */
  brand?: ReactNode;
  ariaLabel: string;
  actions?: SidebarAction[];
  groups: SidebarNavGroup[];
  /** Pass null to hide the "Back to Gemba" link (e.g. on the main app sidebar). */
  backLink?: { label: string; href: string } | null;
  /** Extra content pinned to the bottom (user card, sign out). Receives the rail state. */
  footer?: (collapsed: boolean) => ReactNode;
  /** data-tour target for the onboarding tour; placed on whichever nav is visible. */
  dataTour?: string;
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

function isActive(pathname: string, item: SidebarNavItem, homeHref: string) {
  const path = item.href.split("?")[0];
  if (item.exact ?? path === homeHref) return pathname === path;
  return pathname === path || pathname.startsWith(path + "/");
}

function RailLink({
  href,
  label,
  fullLabel,
  icon: Icon,
  active = false,
  primary = false,
}: {
  href: string;
  label: string;
  fullLabel: string;
  icon: LucideIcon;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      title={fullLabel}
      aria-label={fullLabel}
      aria-current={active ? "page" : undefined}
      className={`group flex w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
        active ? "bg-indigo-50 text-indigo-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          primary ? "bg-[#52618a] text-white group-hover:bg-[#445174]" : ""
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="line-clamp-2 w-full text-[10.5px] font-medium leading-tight">
        {label}
      </span>
    </Link>
  );
}

export function ModuleSidebar({
  id,
  title,
  subtitle,
  homeHref,
  brand,
  ariaLabel,
  actions = [],
  groups,
  backLink = { label: "Back to Gemba", href: "/" },
  footer,
  dataTour,
  open = false,
  onClose,
  collapsed = false,
  onToggle,
}: ModuleSidebarProps) {
  const pathname = usePathname();
  const panel = useRef<HTMLElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const visibleGroups = groups.filter((group) => group.items.length > 0);

  const toggleDesktop = () => {
    onToggle?.();
    requestAnimationFrame(() => {
      (collapsed ? closeButton : openButton).current?.focus();
    });
  };

  // Mobile drawer: lock scroll, trap focus, close on Escape or when resized to desktop.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []).filter(
        (element) => element.getClientRects().length,
      );
    focusable()[0]?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) onClose?.();
    };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", handleKey);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" onClick={onClose} />}

      {/* ── Collapsed rail (desktop only) ── */}
      {collapsed && (
        <div className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-slate-200 bg-white lg:flex">
          <div className="flex h-14 w-full shrink-0 items-center justify-center border-b border-slate-100">
            <button
              ref={openButton}
              type="button"
              onClick={toggleDesktop}
              aria-label="Open sidebar"
              title="Open sidebar"
              aria-expanded={false}
              aria-controls={id}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-col items-center gap-1 border-b border-slate-100 py-2">
              {actions.map((action) => (
                <RailLink
                  key={action.href}
                  href={action.href}
                  label={action.shortLabel ?? action.label}
                  fullLabel={action.label}
                  icon={action.icon}
                  primary={action.variant !== "secondary"}
                />
              ))}
            </div>
          )}
          <nav
            data-tour={dataTour}
            aria-label={`${ariaLabel} shortcuts`}
            className="flex min-h-0 w-full flex-1 flex-col items-center thin-scrollbar overflow-y-auto overflow-x-hidden py-2 [scrollbar-gutter:stable_both-edges]"
          >
            {visibleGroups.map((group, index) => (
              <div
                key={group.name}
                role="group"
                aria-label={group.name}
                className={`flex flex-col items-center gap-1 ${index ? "mt-2 w-full border-t border-slate-100 pt-2" : ""}`}
              >
                {group.items.map((item) => (
                  <RailLink
                    key={item.href}
                    href={item.href}
                    label={item.shortLabel ?? item.label}
                    fullLabel={item.label}
                    icon={item.icon}
                    active={isActive(pathname, item, homeHref)}
                  />
                ))}
              </div>
            ))}
          </nav>
          {(backLink || footer) && (
            <div className="flex w-full shrink-0 flex-col items-center gap-1 border-t border-slate-100 py-2">
              {backLink && (
                <RailLink href={backLink.href} label="Back" fullLabel={backLink.label} icon={ArrowLeft} />
              )}
              {footer?.(true)}
            </div>
          )}
        </div>
      )}

      {/* ── Full panel: mobile drawer, and desktop when expanded ── */}
      <aside
        id={id}
        ref={panel}
        aria-label={ariaLabel}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white ${
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        } ${collapsed ? "lg:invisible lg:-translate-x-full" : "lg:visible lg:translate-x-0"}`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4">
          <Link href={homeHref} onClick={onClose} className="flex min-w-0 items-center gap-2.5">
            {brand}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold leading-tight tracking-tight text-slate-900">{title}</span>
              {subtitle && (
                <span className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-400">
                  {subtitle}
                </span>
              )}
            </span>
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={toggleDesktop}
            aria-label="Close sidebar"
            title="Close sidebar"
            aria-expanded={true}
            aria-controls={id}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 lg:flex"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            Close
          </button>
        </div>
        {actions.length > 0 && (
          <div className="space-y-1 px-3 pb-2 pt-3">
            {actions.map((action) =>
              action.variant === "secondary" ? (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={onClose}
                  className="flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  {action.label}
                </Link>
              ) : (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={onClose}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#52618a] px-3 text-sm font-medium text-white hover:bg-[#445174]"
                >
                  <action.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  {action.label}
                </Link>
              ),
            )}
          </div>
        )}
        <nav
          data-tour={collapsed ? undefined : dataTour}
          className="min-h-0 flex-1 space-y-6 overflow-y-auto thin-scrollbar px-3 pb-6 pt-3">
          {visibleGroups.map((group) => (
            <div key={group.name}>
              <p className="mx-3 mb-2 border-b border-slate-200 pb-2 text-xs font-medium text-slate-400">
                {group.name}
              </p>
              {group.items.map((item) => {
                const active = isActive(pathname, item, homeHref);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`my-0.5 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                      active ? "bg-indigo-50 text-indigo-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    <item.icon
                      className={`h-4 w-4 shrink-0 ${active ? "text-indigo-700" : "text-slate-400"}`}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {footer?.(false)}
        {backLink && (
          <Link
            href={backLink.href}
            onClick={onClose}
            className="flex items-center gap-2 border-t border-slate-200 px-6 py-4 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
            {backLink.label}
          </Link>
        )}
      </aside>
    </>
  );
}
