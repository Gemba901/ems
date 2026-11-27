"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ListChecks,
  Target,
  LifeBuoy,
  RefreshCw,
} from "lucide-react";
import {
  planningPeriodBounds,
  planningPeriodLabel,
} from "@/services/leadership-excellence/performance-planning/planning-period";
import type {
  ExecutionAction,
  ExecutionAssignment,
  ExecutionGoal,
} from "@/services/leadership-excellence/execution.service";
import { useExecution } from "./ExecutionProvider";
import { Button, control } from "../performance-planning/PlanningUi";
import { useLexPlanningPeriod } from "../LexPlanningPeriod";
import { Button as UiButton } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

const BASE = "/leadership-excellence/execution";
interface ScopeValue {
  scope: "department" | "personal";
  cycle: string;
  department: string;
  goals: ExecutionGoal[];
  assignments: ExecutionAssignment[];
  actions: ExecutionAction[];
}
const ScopeContext = createContext<ScopeValue | null>(null);
export function useExecutionScope() {
  const context = useContext(ScopeContext);
  if (!context) throw new Error("ExecutionFrame is required.");
  return context;
}

export function ExecutionFrame({ children }: { children: ReactNode }) {
  const { data, busy, refresh, confirmNavigation } = useExecution();
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const { cycle: selectedCycle, setCycle } = useLexPlanningPeriod();
  const requestedScope = search.get("scope");
  const scope =
    requestedScope !== "personal" && data.canViewDepartment
      ? "department"
      : "personal";
  const approvedCycles = [
    ...new Set([
      ...data.goals.map((g) => g.cycle),
      ...data.assignments.map((a) => a.cycle),
      ...data.actions.map((a) => a.cycle),
      ...data.supportRequests.flatMap((request) =>
        request.cycle ? [request.cycle] : [],
      ),
    ]),
  ]
    .sort()
    .reverse();
  const [choice, setChoice] = useState({
    user: data.actor.userId,
    department: "",
  });
  const requestedCycle = search.get("cycle") || "";
  // Explicit links win; a planning selection remains selected even before
  // that period has any approved work. Never substitute a different year's work.
  const cycle = planningPeriodBounds(requestedCycle)
    ? requestedCycle
    : selectedCycle || approvedCycles[0] || "";
  const cycles = [...new Set([...approvedCycles, ...(cycle ? [cycle] : [])])]
    .sort()
    .reverse();
  useEffect(() => {
    if (cycle && cycle !== selectedCycle) setCycle(cycle);
  }, [cycle, selectedCycle, setCycle]);
  const department = choice.user === data.actor.userId ? choice.department : "";
  const inPeriod = (record: { cycle: string; departmentId: string }) =>
    (!cycle || record.cycle === cycle) &&
    (scope === "personal" || !department || record.departmentId === department);
  const goals = data.goals.filter(
    (g) =>
      g.current &&
      inPeriod(g) &&
      (scope === "personal" ? g.personal : g.kind !== "COMPANY"),
  );
  const assignments = data.assignments.filter(
    (a) =>
      inPeriod(a) &&
      (scope === "department" ||
        a.assignment.providerId === data.actor.employeeId ||
        a.assignment.ownerId === data.actor.employeeId ||
        data.goals.some(
          (g) =>
            g.documentId === a.documentId &&
            g.item.id === a.assignment.goalId &&
            g.personal,
        )),
  );
  const actions = data.actions.filter(
    (a) =>
      inPeriod(a) &&
      (scope === "department" || a.action.ownerId === data.actor.employeeId),
  );
  const tabs = [
    [BASE, "Overview", Target],
    [`${BASE}/results-entry`, "KPI results", ListChecks],
    [`${BASE}/delivery-actions`, "My actions", CalendarDays],
    [`${BASE}/support-requests`, "Support requests", LifeBuoy],
  ] as const;
  const query = `?scope=${scope}&cycle=${encodeURIComponent(cycle)}`;
  return (
    <ScopeContext.Provider
      value={{ scope, cycle, department, goals, assignments, actions }}
    >
      <div className="space-y-6 text-foreground">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Area 04 · Performance execution
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {scope === "department" ? "My Department" : "My Performance"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your approved goals, KPI results, actions and support in one
              place.
            </p>
          </div>
          <Button
            aria-label="Refresh approved work"
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </header>
        <section className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
          {data.canViewDepartment && (
            <div
              className="flex rounded-lg bg-muted p-1"
              aria-label="Workspace scope"
            >
              {(
                [
                  ["personal", "My Performance"],
                  ["department", "My Department"],
                ] as const
              ).map(([value, title]) => (
                <UiButton variant="ghost"
                  key={value}
                  type="button"
                  className={`h-auto whitespace-normal rounded-md px-3 py-2 text-sm font-medium ${scope === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                  aria-pressed={scope === value}
                  onClick={() => {
                    if (confirmNavigation())
                      router.push(
                        `${pathname}?scope=${value}&cycle=${encodeURIComponent(cycle)}`,
                      );
                  }}
                >
                  {title}
                </UiButton>
              ))}
            </div>
          )}
          <label className="min-w-44 text-xs font-medium text-muted-foreground">
            Planning period
            <NativeSelect
              className={`${control} mt-1`}
              value={cycle}
              onChange={(e) => {
                if (!confirmNavigation()) return;
                router.push(
                  `${pathname}?scope=${scope}&cycle=${encodeURIComponent(e.target.value)}`,
                );
              }}
            >
              {cycles.length ? (
                cycles.map((c) => (
                  <option key={c} value={c}>
                    {planningPeriodLabel(c)}
                  </option>
                ))
              ) : (
                <option value="">No approved period</option>
              )}
            </NativeSelect>
          </label>
          {scope === "department" && (
            <label className="min-w-44 text-xs font-medium text-muted-foreground">
              Department
              <NativeSelect
                className={`${control} mt-1`}
                value={department}
                onChange={(e) => {
                  if (confirmNavigation())
                    setChoice({
                      ...choice,
                      user: data.actor.userId,
                      department: e.target.value,
                    });
                }}
              >
                <option value="">All permitted departments</option>
                {data.references.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <span className="ml-auto pb-2 text-xs text-muted-foreground">
            {data.actor.name}
          </span>
        </section>
        <nav
          className="flex flex-wrap gap-2 border-b border-border pb-3"
          aria-label="Performance execution pages"
        >
          {tabs.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={`${href}${query}`}
              aria-current={pathname === href ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${pathname === href ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted"}`}
            >
              <Icon size={16} />
              {title}
            </Link>
          ))}
        </nav>
        <div key={`${data.actor.userId}:${cycle}:${scope}:${department}`}>
          {children}
        </div>
      </div>
    </ScopeContext.Provider>
  );
}
