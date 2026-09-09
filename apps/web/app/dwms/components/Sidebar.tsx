"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  PanelLeft,
  Home,
  ClipboardList,
  Send,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Settings2,
  Plus,
  BellPlus,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}
const managementRoles = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

const navigationIcons: Record<string, LucideIcon> = {
  "/dwms": Home,
  "/dwms/tasks": ClipboardList,
  "/dwms/assignedTasks": Send,
  "/dwms/approvalTasks": ClipboardCheck,
  "/dwms/alerts": AlertTriangle,
  "/dwms/dashboard": BarChart3,
  "/dwms/activities": BookOpenCheck,
  "/dwms/settings": Settings2,
};

function RailLink({
  href,
  label,
  icon: Icon,
  active = false,
  primary = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link href={href} />}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${primary ? "bg-[#52618a] text-white hover:bg-[#445174]" : active ? "bg-indigo-50 text-indigo-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  open = false,
  onClose,
  collapsed = false,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const panel = useRef<HTMLElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const toggleDesktop = () => {
    onToggle?.();
    requestAnimationFrame(() => {
      (collapsed ? closeButton : openButton).current?.focus();
    });
  };
  const role = String(user?.roleLevel ?? "").toUpperCase();
  const groups = [
    {
      name: "Your work",
      items: [
        ["My Routine Work ", "/dwms"],
        ["Tasks assigned to me", "/dwms/tasks"],
        ["Tasks assigned by me", "/dwms/assignedTasks"],
        ["Approvals", "/dwms/approvalTasks"],
        ["Alerts/Abnormality", "/dwms/alerts"],
      ],
    },
    {
      name: "Manage",
      items: [
        ["Reports", "/dwms/dashboard"],
        ...(managementRoles.has(role) || role === "HOD"
          ? [["Activities", "/dwms/activities"]]
          : []),
        ...(managementRoles.has(role) ? [["Settings", "/dwms/settings"]] : []),
      ],
    },
  ];

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const links = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>("a[href], button") ?? [],
      );
    links()[0]?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab") return;
      const elements = links().filter(
        (element) => element.getClientRects().length,
      );
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
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden"
          onClick={onClose}
        />
      )}
      {collapsed && (
        <TooltipProvider>
          <div className="fixed inset-y-0 left-0 z-30 hidden w-12 flex-col items-center border-r border-slate-200 bg-white lg:flex">
            <div className="flex h-14 shrink-0 items-center">
              <button
                ref={openButton}
                type="button"
                onClick={toggleDesktop}
                aria-label="Open sidebar"
                title="Open sidebar"
                aria-expanded={false}
                aria-controls="dwms-sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <PanelLeft
                  className="h-4 w-4"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="space-y-1 pb-3">
              <RailLink
                href="/dwms/actions/new?mode=TASK"
                label="Assign task"
                icon={Plus}
                primary
              />
              <RailLink
                href="/dwms/actions/new?mode=ALERT"
                label="Raise alert"
                icon={BellPlus}
              />
            </div>
            <nav
              aria-label="Daily work shortcuts"
              className="min-h-0 w-full flex-1 overflow-y-auto px-1 pb-2"
            >
              {groups.map((group, index) => (
                <div
                  key={group.name}
                  role="group"
                  aria-label={group.name}
                  className={`space-y-1 ${index ? "mt-3 border-t border-slate-200 pt-3" : ""}`}
                >
                  {group.items.map(([label, href]) => (
                    <RailLink
                      key={href}
                      href={href}
                      label={label}
                      icon={navigationIcons[href]}
                      active={
                        pathname === href ||
                        (href !== "/dwms" && pathname.startsWith(href + "/"))
                      }
                    />
                  ))}
                </div>
              ))}
            </nav>
            <div className="shrink-0 border-t border-slate-200 py-2">
              <RailLink href="/" label="Back to Gemba" icon={ArrowLeft} />
            </div>
          </div>
        </TooltipProvider>
      )}
      <aside
        id="dwms-sidebar"
        ref={panel}
        aria-label="Daily work navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white ${open ? "visible translate-x-0" : "invisible -translate-x-full"} ${collapsed ? "lg:invisible lg:-translate-x-full" : "lg:visible lg:translate-x-0"}`}
      >
        <div className="flex h-14 shrink-0 border-b border-slate-100 items-center justify-between px-5">
          <Link
            href="/dwms"
            onClick={onClose}
            className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900"
          >
            Daily Work Management
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={toggleDesktop}
            aria-label="Close sidebar"
            title="Close sidebar"
            aria-expanded={true}
            aria-controls="dwms-sidebar"
            className="ml-2 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 lg:flex"
          >
            <PanelLeft
              className="h-4 w-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            Close
          </button>
        </div>
        <div className="space-y-1 px-3 pb-5 pt-3">
          <Link
            href="/dwms/actions/new?mode=TASK"
            onClick={onClose}
            className="flex min-h-10 items-center justify-center rounded-xl bg-[#52618a] px-3 text-sm font-medium text-white hover:bg-[#445174]"
          >
            Assign task
          </Link>
          <Link
            href="/dwms/actions/new?mode=ALERT"
            onClick={onClose}
            className="flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Raise alert
          </Link>
        </div>
        <nav className="min-h-0 flex-1 space-y-7 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.name}>
              <p className="mx-3 mb-2 border-b border-slate-200 pb-2 text-xs font-medium text-slate-400">
                {group.name}
              </p>
              {group.items.map(([label, href]) => {
                const active =
                  pathname === href ||
                  (href !== "/dwms" && pathname.startsWith(href + "/"));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`my-0.5 flex min-h-11 items-center rounded-xl px-3 text-sm transition-colors ${active ? "bg-indigo-50 font-medium text-indigo-800" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <Link
          href="/"
          onClick={onClose}
          className="border-t border-slate-200 px-6 py-4 text-sm text-slate-500 hover:text-slate-900"
        >
          Back to Gemba
        </Link>
      </aside>
    </>
  );
}
