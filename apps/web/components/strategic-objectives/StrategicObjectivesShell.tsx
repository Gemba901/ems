"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Layers3,
  ListTree,
  LockKeyhole,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  createStrategicObjectivesService,
  type DemoRole,
  type DemoSession,
  type StrategicObjectivesService,
} from "@/services/strategic-objectives";
import { STRATEGIC_OBJECTIVES_ROUTES as routes } from "@/services/strategic-objectives/routes";

type ContextValue = {
  service: StrategicObjectivesService;
  session: DemoSession | null;
  registerLeaveGuard: (guard: () => boolean) => () => void;
  confirmLeave: () => boolean;
};
const DemoContext = createContext<ContextValue | null>(null);
export function useStrategicObjectives() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("StrategicObjectivesShell is required.");
  return value;
}

const roles: { value: DemoRole; label: string }[] = [
  { value: "LEADERSHIP", label: "CEO / Authorised Leadership" },
  { value: "APPROVER", label: "Approver" },
  { value: "READER", label: "Employee / HOD — read-only" },
];
const navigation = [
  { href: routes.guide, label: "Guide", Icon: BookOpen },
  {
    href: routes.register,
    label: "Objectives & Goals Register",
    Icon: ListTree,
  },
  { href: routes.create, label: "Create Objective", Icon: Plus },
];

export function StrategicObjectivesShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [service] = useState(() => createStrategicObjectivesService());
  const [role, setRole] = useState<DemoRole>("LEADERSHIP");
  const [session, setSession] = useState<DemoSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaveGuard = useRef<(() => boolean) | null>(null);
  const registerLeaveGuard = useCallback((guard: () => boolean) => {
    leaveGuard.current = guard;
    return () => {
      if (leaveGuard.current === guard) leaveGuard.current = null;
    };
  }, []);
  const confirmLeave = useCallback(() => leaveGuard.current?.() ?? true, []);
  useEffect(() => {
    let active = true;
    void service
      .getSession()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not open the demo session. Reload this page to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [service]);

  async function switchRole(next: DemoRole) {
    if (next === role || !confirmLeave()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await service.setDemoRole(next);
      setSession(updated);
      setRole(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not switch the demo role.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DemoContext.Provider
      value={{ service, session, registerLeaveGuard, confirmLeave }}
    >
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <a
          href="#strategic-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-white focus:p-3"
        >
          Skip to module content
        </a>
        <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5">
            <div className="min-w-0 flex-1">
              <Link
                href="/leadership-excellence"
                onNavigate={(event) => {
                  if (!confirmLeave()) event.preventDefault();
                }}
                className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back to Leadership Excellence
              </Link>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-teal-700">
                <Layers3 size={17} aria-hidden="true" />
                BEES <span className="text-slate-300">/</span> Gemba PMS
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Strategic Objectives & Linked Goals
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Leadership Excellence · Performance Planning & Alignment
              </p>
            </div>
            <div className="w-full sm:w-72">
              <label
                htmlFor="strategy-demo-role"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"
              >
                <ShieldCheck size={15} aria-hidden="true" />
                Demo role switcher
              </label>
              <select
                id="strategy-demo-role"
                value={role}
                disabled={busy}
                onChange={(event) =>
                  void switchRole(event.target.value as DemoRole)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-teal-600 disabled:opacity-60"
              >
                {roles.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-white px-4 py-4 lg:min-h-[calc(100vh-133px)] lg:border-r lg:border-b-0 lg:py-7">
            <nav
              aria-label="Strategic planning navigation"
              className="flex flex-wrap gap-1.5 lg:flex-col"
            >
              {navigation.map(({ href, label, Icon }) => {
                const active =
                  pathname === href ||
                  (href === routes.register && pathname === routes.goal);
                const classes = `flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`;
                return href === routes.create && !session?.canEdit ? (
                  <span
                    key={href}
                    aria-disabled="true"
                    className={`${classes} cursor-not-allowed opacity-50`}
                    title="Only authorised leadership can create objectives"
                  >
                    <LockKeyhole size={16} aria-hidden="true" />
                    {label}
                  </span>
                ) : (
                  <Link
                    key={href}
                    href={href}
                    onNavigate={(event) => {
                      if (!confirmLeave()) event.preventDefault();
                    }}
                    aria-current={active ? "page" : undefined}
                    className={classes}
                  >
                    <Icon size={17} className="shrink-0" aria-hidden="true" />
                    {label}
                    {active && (
                      <ChevronRight
                        size={15}
                        className="ml-auto shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
            <p className="mt-7 hidden border-t border-slate-100 px-3 pt-5 text-xs leading-5 text-slate-500 lg:block">
              One company plan.
              <br />
              Clear objectives.
              <br />
              Distinct departmental contributions.
            </p>
          </aside>
          <main
            id="strategic-main"
            className="min-w-0 px-5 py-6 sm:px-8 sm:py-8"
          >
            <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-xs text-teal-900">
              <strong>Frontend demo</strong>
              <span>· Synthetic company data · Changes reset on reload</span>
            </div>
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}
            {busy || !session ? (
              <p role="status">
                {busy ? "Switching demo role…" : "Opening the demo…"}
              </p>
            ) : (
              <div key={role}>{children}</div>
            )}
          </main>
        </div>
      </div>
    </DemoContext.Provider>
  );
}
