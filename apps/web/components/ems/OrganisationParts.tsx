"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Info, MapPin } from "lucide-react";
import { HOD_STATE_LABEL, initials, type DepartmentHod, type DepartmentIssue } from "./department-directory";
import { colourOf } from "./branch-colours";

/** A branch's colour on these pages. "Branch not recorded" gets a visible grey instead of the chart's near-white fill. */
export const branchShade = (colours: ReadonlyMap<string, string>, key: string) => key ? colourOf(colours, key) : "#94a3b8";

/** Organisation's title and tabs. Only Departments exists so far; the org chart tab is shown as coming. */
export function OrganisationHeader({ actions }: { actions?: ReactNode }) {
  return <header className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs text-slate-500"><Link href="/ems" className="hover:text-purple-900 hover:underline">EMS</Link> / Organisation</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Organisation</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <nav aria-label="Organisation views" className="flex gap-1 border-b border-slate-200">
      <Link href="/ems/organisation" aria-current="page"
        className="-mb-px border-b-2 border-purple-900 px-3 py-2.5 text-sm font-semibold text-purple-900">Departments</Link>
      <span aria-disabled="true" className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-slate-400">
        Org chart <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Soon</span>
      </span>
    </nav>
  </header>;
}

/** A pin filled with the branch's colour, with a thin dark edge so pale colours (yellow, grey) still show on white. */
function BranchPin({ colour }: { colour: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill={colour} stroke="#1e293b" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" fill="#fff" />
  </svg>;
}

/** A branch name that stands out: a pin in the branch's colour (purple outline when no colour is given), dark, semibold. */
export function BranchLabel({ label, className = "", colour }: { label: string; className?: string; colour?: string }) {
  // A span (not a paragraph), so it can also sit inside headings.
  return <span className={`flex items-start gap-1.5 text-sm font-semibold text-slate-800 ${className}`}>
    <span className="flex h-[1lh] shrink-0 items-center">{colour ? <BranchPin colour={colour} /> : <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-purple-800" />}</span>{label}
  </span>;
}

/** A small "No HOD"-style pill, only as wide as its text. */
export function Pill({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "slate" }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{children}</span>;
}

const HOD_TONE: Record<DepartmentHod["state"], string> = {
  ASSIGNED: "text-emerald-700", PENDING: "text-amber-800", NEEDS_ATTENTION: "text-amber-800", NOT_RECORDED: "text-amber-800", UNASSIGNED: "text-slate-500",
};

/** A HOD with an initials circle (`avatar={false}` for tables): name (linked to the profile once registered), job title and code, and the HOD's state if not confirmed. */
export function HodLine({ hod, compact = false, avatar = true, onSelect }: { hod: DepartmentHod; compact?: boolean; avatar?: boolean;
  /** When given, the name shows this person's HOD roles; a small icon beside it opens the profile. */
  onSelect?: (personId: string) => void }) {
  const person = hod.person;
  if (!person) return hod.state === "UNASSIGNED" ? <Pill tone="slate">No HOD (by choice)</Pill> : <Pill>{hod.state === "NOT_RECORDED" ? "No HOD" : HOD_STATE_LABEL[hod.state]}</Pill>;
  return <div className="flex min-w-0 items-center gap-2.5">
    {avatar && <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-purple-100 font-bold text-purple-900 ${compact ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-xs"}`}>{initials(person.name)}</span>}
    <div className="min-w-0">
      {person.id && onSelect ? <HodName id={person.id} name={person.name} onSelect={onSelect} />
        : person.id
        ? <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="block truncate font-medium text-purple-900 hover:underline">{person.name}</Link>
        : <p className="truncate font-medium text-slate-800">{person.name}</p>}
      <p className="truncate text-xs text-slate-500">{[person.jobTitle, person.employeeCode].filter(Boolean).join(" · ")}</p>
      {hod.state !== "ASSIGNED" && <p className={`text-xs font-medium ${HOD_TONE[hod.state]}`}>{HOD_STATE_LABEL[hod.state]}</p>}
    </div>
  </div>;
}

/** A HOD's name that shows their HOD roles, with a small icon beside it for their profile. */
export function HodName({ id, name, onSelect, className = "" }: { id: string; name: string; onSelect: (personId: string) => void; className?: string }) {
  return <span className={`flex min-w-0 items-center gap-1 ${className}`}>
    <button type="button" onClick={() => onSelect(id)} title={`Show ${name}'s HOD roles`}
      className="truncate text-left font-medium text-purple-900 hover:underline">{name}</button>
    <Link href={`/ems/employees/${encodeURIComponent(id)}`} aria-label={`Open ${name}'s profile`} title="Open profile"
      className="shrink-0 rounded p-0.5 text-slate-400 hover:text-purple-900"><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></Link>
  </span>;
}

/** "Needs attention": one problem per line; ⓘ opens a plain explanation underneath. Named branches can be links (`onBranch`), and long lists fold behind "+N". */
export function IssueList({ issues, action, onBranch }: { issues: DepartmentIssue[]; action?: (issue: DepartmentIssue) => ReactNode;
  onBranch?: (issue: DepartmentIssue, branchKey: string) => void }) {
  if (!issues.length) return <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />All set</p>;
  return <ul className="space-y-1.5">{issues.map((issue, index) => <IssueItem key={index} issue={issue} action={action?.(issue)} onBranch={onBranch} />)}</ul>;
}

const SHOWN_BRANCHES = 3;

function IssueItem({ issue, action, onBranch }: { issue: DepartmentIssue; action?: ReactNode; onBranch?: (issue: DepartmentIssue, branchKey: string) => void }) {
  const [open, setOpen] = useState(false), [all, setAll] = useState(false), id = useId();
  const branches = issue.branches ?? [], hidden = branches.length - SHOWN_BRANCHES;
  const shown = all || hidden <= 0 ? branches : branches.slice(0, SHOWN_BRANCHES);
  return <li className="text-sm">
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.kind === "EMPTY" ? "bg-slate-400" : "bg-amber-500"}`} />
      {issue.lead && branches.length ? <span className="text-slate-800">{issue.lead}{issue.kind === "NO_HOD" ? ":" : ""}{" "}
        {shown.map((b, i) => <span key={b.key}>{i > 0 && ", "}
          {onBranch ? <button type="button" onClick={() => onBranch(issue, b.key)} title={`Choose HOD for ${b.label}`}
            className="font-medium text-purple-900 hover:underline">{b.label}</button> : b.label}</span>)}
        {hidden > 0 && <> <button type="button" aria-expanded={all} onClick={() => setAll(v => !v)}
          className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">{all ? "show fewer" : `+${hidden}`}</button></>}
      </span> : <span className="text-slate-800">{issue.text}</span>}
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={`What does “${issue.text}” mean?`} onClick={() => setOpen(v => !v)}
        className="shrink-0 rounded text-slate-400 hover:text-purple-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700"><Info className="h-4 w-4" /></button>
      {action}
    </div>
    {open && <p id={id} className="ml-4 mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{issue.help}</p>}
  </li>;
}
