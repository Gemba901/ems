"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { EmsService } from "@/services/ems.service";
import { employeeNeighbours, loadEmployeeNav, saveEmployeeNav, type EmployeeNavContext } from "./employee-navigation";

/** "Previous · 3 of 14 · Next" between profiles, in the order of the list HR came from. */
export default function EmployeeListNav({ employeeId, token, blocked }: { employeeId: string; token: string; blocked?: boolean }) {
  const router = useRouter();
  const [context, setContext] = useState<EmployeeNavContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setContext(loadEmployeeNav()); setError(null); }, [employeeId]);
  const here = employeeNeighbours(context, employeeId);
  if (!context || !here) return null; // Opened directly, not from the list.

  const open = (id: string) => router.replace(`/ems/employees/${encodeURIComponent(id)}`);
  // Crossing a page edge: load the adjacent page with the same filters, then go to its first/last person.
  const go = async (direction: -1 | 1) => {
    const sameId = direction < 0 ? here.previousId : here.nextId;
    if (sameId) return open(sameId);
    const page = direction < 0 ? here.previousPage : here.nextPage;
    if (!page) return;
    setBusy(true); setError(null);
    try {
      const result = await EmsService.getEmployees(token, { ...context.filters, page, limit: context.limit });
      const ids = result.data.map(employee => employee.id);
      const target = direction < 0 ? ids[ids.length - 1] : ids[0];
      if (!target) throw new Error("The list changed. Go back to the employee list.");
      saveEmployeeNav({ ...context, page, ids, total: result.pagination.total, pages: Math.max(1, result.pagination.pages) });
      open(target);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t load the next employees."); }
    finally { setBusy(false); }
  };
  const canPrevious = !!(here.previousId || here.previousPage), canNext = !!(here.nextId || here.nextPage);
  const button = "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40";
  return <nav aria-label="Move between employees" className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
    <button type="button" className={button} disabled={!canPrevious || busy || blocked} onClick={() => void go(-1)}
      title={blocked ? "Save or cancel your edits first" : "Previous employee in your list"}><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
    <span aria-live="polite">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" /> : `${here.position} of ${here.total}`}</span>
    <button type="button" className={button} disabled={!canNext || busy || blocked} onClick={() => void go(1)}
      title={blocked ? "Save or cancel your edits first" : "Next employee in your list"}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
    {error && <span role="alert" className="text-red-600">{error}</span>}
  </nav>;
}
