"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleHelp, PanelLeft, X, type LucideIcon } from "lucide-react";
import { ModuleTour, startTour, type TourStep } from "@/components/onboarding/ModuleTour";

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
  /** Module guided tour: runs on first visit and adds a "Take a tour" button. */
  tour?: { id: string; steps: TourStep[] };
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
      data-tour={`nav:${href}`}
      title={fullLabel}
      aria-label={fullLabel}
      aria-current={active ? "page" : undefined}
      className={`group flex w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
          primary ? "bg-primary text-primary-foreground group-hover:bg-primary/90" : ""
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
  tour,
  open = false,
  onClose,
  collapsed = false,
  onToggle,
}: ModuleSidebarProps) {
  const pathname = usePathname();
  const mobileCloseButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const activeItem = visibleGroups
    .flatMap((group) => group.items)
    .filter((item) => isActive(pathname, item, homeHref))
    .sort((a, b) => b.href.split("?")[0].length - a.href.split("?")[0].length)[0];

  const toggleDesktop = () => {
    onToggle?.();
    requestAnimationFrame(() => {
      (collapsed ? closeButton : openButton).current?.focus();
    });
  };

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) onClose?.();
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open, onClose]);

  const panelContent = (mobile: boolean) => (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
        <Link href={homeHref} onClick={onClose} className="flex min-w-0 items-center gap-2.5">
          {brand}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold leading-tight tracking-tight text-foreground">{title}</span>
            {subtitle && (
              <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {subtitle}
              </span>
            )}
          </span>
        </Link>
        {mobile ? (
          <Button ref={mobileCloseButton} size="icon" variant="ghost" onClick={onClose} aria-label="Close navigation">
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            ref={closeButton}
            type="button"
            onClick={toggleDesktop}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            aria-expanded={true}
            aria-controls={id}
            variant="ghost"
            size="icon"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        )}
      </div>
      {actions.length > 0 && (
        <div className="space-y-1 px-3 pb-2 pt-3">
          {actions.map((action) =>
            action.variant === "secondary" ? (
              <Link
                key={action.href}
                href={action.href}
                data-tour={`nav:${action.href}`}
                onClick={onClose}
                className="flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-primary hover:bg-sidebar-accent"
              >
                {action.label}
              </Link>
            ) : (
              <Link
                key={action.href}
                href={action.href}
                data-tour={`nav:${action.href}`}
                onClick={onClose}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <action.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                {action.label}
              </Link>
            ),
          )}
        </div>
      )}
      <nav
        data-tour={mobile || !collapsed ? dataTour : undefined}
        aria-label={ariaLabel}
        className="min-h-0 flex-1 overflow-y-auto thin-scrollbar px-3 pb-6 pt-3">
        {visibleGroups.map((group, index) => (
          <div key={group.name} role="group" aria-label={group.name} className={index ? "mt-4 border-t border-sidebar-border pt-4" : ""}>
            <p className="mx-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.name}
            </p>
            {group.items.map((item) => {
              const active = activeItem === item;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={`nav:${item.href}`}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`my-0.5 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }`}
                >
                  <item.icon
                    className={`h-4 w-4 shrink-0 ${active ? "text-sidebar-accent-foreground" : "text-muted-foreground"}`}
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
      {tour && (
        <Button variant="ghost"
          type="button"
          data-tour="tour-replay"
          onClick={() => {
            onClose?.();
            startTour(tour.id);
          }}
          className="min-h-11 w-full justify-start gap-2 rounded-none border-t border-sidebar-border px-6 py-4 text-left text-sm text-muted-foreground hover:text-foreground"
        >
          <CircleHelp className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
          Take a tour
        </Button>
      )}
      {backLink && (
        <Link
          href={backLink.href}
          onClick={onClose}
          className="flex min-h-11 items-center gap-2 border-t border-sidebar-border px-6 py-4 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
          {backLink.label}
        </Link>
      )}
    </>
  );

  return (
    <>
      {/* ── Collapsed rail (desktop only) ── */}
      {collapsed && (
        <div className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="flex h-14 w-full shrink-0 items-center justify-center border-b border-sidebar-border">
            <Button variant="ghost"
              ref={openButton}
              type="button"
              onClick={toggleDesktop}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              aria-expanded={false}
              aria-controls={id}
              size="icon"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-col items-center gap-1 border-b border-sidebar-border py-2">
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
                className={`flex w-full flex-col items-center gap-1 ${index ? "mt-3 border-t border-sidebar-border pt-3" : ""}`}
              >
                {group.items.map((item) => (
                  <RailLink
                    key={item.href}
                    href={item.href}
                    label={item.shortLabel ?? item.label}
                    fullLabel={item.label}
                    icon={item.icon}
                    active={activeItem === item}
                  />
                ))}
              </div>
            ))}
          </nav>
          {(backLink || footer || tour) && (
            <div className="flex w-full shrink-0 flex-col items-center gap-1 border-t border-sidebar-border py-2">
              {tour && (
                <Button variant="ghost"
                  type="button"
                  data-tour="tour-replay"
                  onClick={() => startTour(tour.id)}
                  title="Take a tour"
                  aria-label="Take a tour"
                  className="group flex h-auto w-[72px] flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg">
                    <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <span className="text-[10.5px] font-medium leading-tight">Tour</span>
                </Button>
              )}
              {backLink && (
                <RailLink href={backLink.href} label="Back" fullLabel={backLink.label} icon={ArrowLeft} />
              )}
              {footer?.(true)}
            </div>
          )}
        </div>
      )}

      <aside
        id={open ? undefined : id}
        aria-label={ariaLabel}
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground ${collapsed ? "" : "lg:flex"}`}
      >
        {!open && panelContent(false)}
      </aside>
      <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
        <SheetContent
          id={open ? id : undefined}
          side="left"
          initialFocus={mobileCloseButton}
          showCloseButton={false}
          className="gap-0 bg-sidebar text-sidebar-foreground data-[side=left]:w-64 data-[side=left]:border-sidebar-border"
        >
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          {open && panelContent(true)}
        </SheetContent>
      </Sheet>
      {tour && <ModuleTour tourId={tour.id} steps={tour.steps} />}
    </>
  );
}
