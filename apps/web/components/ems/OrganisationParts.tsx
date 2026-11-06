"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Info, MapPin } from "lucide-react";
import { HOD_STATE_LABEL, initials, type DepartmentHod, type DepartmentIssue } from "./department-directory";

/** Organisation's title and tabs. Only Departments exists so far; the org chart tab is shown as coming. */
export function OrganisationHeader({ actions }: { actions?: ReactNode }) {
  return <header className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs text-slate-500"><Link href="/ems" className="hover:text-violet-700 hover:underline">EMS</Link> / Organisation</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Organisation</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <nav aria-label="Organisation views" className="flex gap-1 border-b border-slate-200">
      <Link href="/ems/organisation" aria-current="page"
        className="-mb-px border-b-2 border-violet-700 px-3 py-2.5 text-sm font-semibold text-violet-800">Departments</Link>
      <span aria-disabled="true" className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-slate-400">
        Org chart <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Soon</span>
      </span>
    </nav>
  </header>;
}

/** A branch name that stands out: pin icon, dark, semibold. */
export function BranchLabel({ label, className = "" }: { label: string; className?: string }) {
  // A span (not a paragraph), so it can also sit inside headings.
  return <span className={`flex items-center gap-1.5 text-sm font-semibold text-slate-800 ${className}`}>
    <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-violet-600" />{label}
  </span>;
}

/** A small "No HOD"-style pill, only as wide as its text. */
export function Pill({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "slate" }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{children}</span>;
}

const HOD_TONE: Record<DepartmentHod["state"], string> = {
  ASSIGNED: "text-emerald-700", PENDING: "text-amber-800", NEEDS_ATTENTION: "text-amber-800", NOT_RECORDED: "text-amber-800", UNASSIGNED: "text-slate-500",
};

/** A HOD with an initials circle: name (linked to the profile once registered), job title and code, and the HOD's state if not confirmed. */
export function HodLine({ hod, compact = false }: { hod: DepartmentHod; compact?: boolean }) {
  const person = hod.person;
  if (!person) return hod.state === "UNASSIGNED" ? <Pill tone="slate">No HOD (by choice)</Pill> : <Pill>{hod.state === "NOT_RECORDED" ? "No HOD" : HOD_STATE_LABEL[hod.state]}</Pill>;
  return <div className="flex min-w-0 items-center gap-2.5">
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-800 ${compact ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-xs"}`}>{initials(person.name)}</span>
    <div className="min-w-0">
      {person.id
        ? <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="block truncate font-medium text-violet-800 hover:underline">{person.name}</Link>
        : <p className="truncate font-medium text-slate-800">{person.name}</p>}
      <p className="truncate text-xs text-slate-500">{[person.jobTitle, person.employeeCode].filter(Boolean).join(" · ")}</p>
      {hod.state !== "ASSIGNED" && <p className={`text-xs font-medium ${HOD_TONE[hod.state]}`}>{HOD_STATE_LABEL[hod.state]}</p>}
    </div>
  </div>;
}

/** "Needs attention": one problem per line; ⓘ opens a plain explanation underneath. */
export function IssueList({ issues, action }: { issues: DepartmentIssue[]; action?: (issue: DepartmentIssue) => ReactNode }) {
  if (!issues.length) return <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />All set</p>;
  return <ul className="space-y-1.5">{issues.map((issue, index) => <IssueItem key={index} issue={issue} action={action?.(issue)} />)}</ul>;
}

function IssueItem({ issue, action }: { issue: DepartmentIssue; action?: ReactNode }) {
  const [open, setOpen] = useState(false), id = useId();
  return <li className="text-sm">
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.kind === "EMPTY" ? "bg-slate-400" : "bg-amber-500"}`} />
      <span className="text-slate-800">{issue.text}</span>
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={`What does “${issue.text}” mean?`} onClick={() => setOpen(v => !v)}
        className="shrink-0 rounded text-slate-400 hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600"><Info className="h-4 w-4" /></button>
      {action}
    </div>
    {open && <p id={id} className="ml-4 mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{issue.help}</p>}
  </li>;
}
