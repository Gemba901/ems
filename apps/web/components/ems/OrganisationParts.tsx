"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Info, MapPin } from "lucide-react";
import { HOD_STATE_LABEL, initials, type DepartmentHod, type DepartmentIssue } from "./department-directory";
import { colourOf } from "./branch-colours";
import { useAuthStore } from "@/store/auth.store";
import { canViewDepartments, ORG_CHART_PATH } from "./organisation-navigation";
import { Button } from "@/components/ui/button";

/** A branch's colour on these pages. "Branch not recorded" gets a visible grey instead of the chart's near-white fill. */
export const branchShade = (colours: ReadonlyMap<string, string>, key: string) => key ? colourOf(colours, key) : "#94a3b8";

/** Organisation's shared navigation. Department records remain restricted to HR and administrators. */
export function OrganisationHeader({ actions, activeTab = "departments" }: { actions?: ReactNode; activeTab?: "departments" | "chart" }) {
  const { user } = useAuthStore();
  const departments = canViewDepartments(user?.roleLevel);
  const tabClass = (tab: "departments" | "chart") => activeTab === tab
    ? "-mb-px border-b-2 border-primary px-3 py-2.5 text-sm font-semibold text-primary"
    : "border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground hover:text-primary";
  return <header className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">{departments ? <Link href="/ems" className="hover:text-primary hover:underline">EMS</Link> : "EMS"} / Organisation</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Organisation</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <nav aria-label="Organisation views" className="flex gap-1 border-b border-border">
      {departments && <Link href="/ems/organisation" aria-current={activeTab === "departments" ? "page" : undefined}
        className={tabClass("departments")}>Departments</Link>}
      <Link href={ORG_CHART_PATH} aria-current={activeTab === "chart" ? "page" : undefined}
        className={tabClass("chart")}>Org chart</Link>
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
  return <span className={`flex items-start gap-1.5 text-sm font-semibold text-foreground ${className}`}>
    <span className="flex h-[1lh] shrink-0 items-center">{colour ? <BranchPin colour={colour} /> : <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />}</span>{label}
  </span>;
}

/** A small "No HOD"-style pill, only as wide as its text. */
export function Pill({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "slate" }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "amber" ? "bg-warning-subtle text-warning" : "bg-muted text-muted-foreground"}`}>{children}</span>;
}

const HOD_TONE: Record<DepartmentHod["state"], string> = {
  ASSIGNED: "text-success", PENDING: "text-warning", NEEDS_ATTENTION: "text-warning", NOT_RECORDED: "text-warning", UNASSIGNED: "text-muted-foreground",
};

/** A HOD with an initials circle (`avatar={false}` for tables): name (linked to the profile once registered), job title and code, and the HOD's state if not confirmed. */
export function HodLine({ hod, compact = false, avatar = true, onSelect }: { hod: DepartmentHod; compact?: boolean; avatar?: boolean;
  /** When given, the name shows this person's HOD roles; a small icon beside it opens the profile. */
  onSelect?: (personId: string) => void }) {
  const person = hod.person;
  if (!person) return hod.state === "UNASSIGNED" ? <Pill tone="slate">No HOD (by choice)</Pill> : <Pill>{hod.state === "NOT_RECORDED" ? "No HOD" : HOD_STATE_LABEL[hod.state]}</Pill>;
  return <div className="flex min-w-0 items-center gap-2.5">
    {avatar && <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary ${compact ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-xs"}`}>{initials(person.name)}</span>}
    <div className="min-w-0">
      {person.id && onSelect ? <HodName id={person.id} name={person.name} onSelect={onSelect} />
        : person.id
        ? <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="block truncate font-medium text-primary hover:underline">{person.name}</Link>
        : <p className="truncate font-medium text-foreground">{person.name}</p>}
      <p className="truncate text-xs text-muted-foreground">{[person.jobTitle, person.employeeCode].filter(Boolean).join(" · ")}</p>
      {hod.state !== "ASSIGNED" && <p className={`text-xs font-medium ${HOD_TONE[hod.state]}`}>{HOD_STATE_LABEL[hod.state]}</p>}
    </div>
  </div>;
}

/** A HOD's name that shows their HOD roles, with a small icon beside it for their profile. */
export function HodName({ id, name, onSelect, className = "" }: { id: string; name: string; onSelect: (personId: string) => void; className?: string }) {
  return <span className={`flex min-w-0 items-center gap-1 ${className}`}>
    <Button variant="ghost" type="button" onClick={() => onSelect(id)} title={`Show ${name}'s HOD roles`}
      className="truncate text-left font-medium text-primary hover:underline h-auto">{name}</Button>
    <Link href={`/ems/employees/${encodeURIComponent(id)}`} aria-label={`Open ${name}'s profile`} title="Open profile"
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-primary"><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></Link>
  </span>;
}

/** "Needs attention": one problem per line; ⓘ opens a plain explanation underneath. Named branches can be links (`onBranch`), and long lists fold behind "+N". */
export function IssueList({ issues, action, onBranch }: { issues: DepartmentIssue[]; action?: (issue: DepartmentIssue) => ReactNode;
  onBranch?: (issue: DepartmentIssue, branchKey: string) => void }) {
  if (!issues.length) return <p className="flex items-center gap-1.5 text-sm font-medium text-success"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />All set</p>;
  return <ul className="space-y-1.5">{issues.map((issue, index) => <IssueItem key={index} issue={issue} action={action?.(issue)} onBranch={onBranch} />)}</ul>;
}

const SHOWN_BRANCHES = 3;

function IssueItem({ issue, action, onBranch }: { issue: DepartmentIssue; action?: ReactNode; onBranch?: (issue: DepartmentIssue, branchKey: string) => void }) {
  const [open, setOpen] = useState(false), [all, setAll] = useState(false), id = useId();
  const branches = issue.branches ?? [], hidden = branches.length - SHOWN_BRANCHES;
  const shown = all || hidden <= 0 ? branches : branches.slice(0, SHOWN_BRANCHES);
  return <li className="text-sm">
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${issue.kind === "EMPTY" ? "bg-muted-foreground" : "bg-warning"}`} />
      {issue.lead && branches.length ? <span className="text-foreground">{issue.lead}{issue.kind === "NO_HOD" ? ":" : ""}{" "}
        {shown.map((b, i) => <span key={b.key}>{i > 0 && ", "}
          {onBranch ? <Button variant="ghost" type="button" onClick={() => onBranch(issue, b.key)} title={`Choose HOD for ${b.label}`}
            className="font-medium text-primary hover:underline h-auto whitespace-normal">{b.label}</Button> : b.label}</span>)}
        {hidden > 0 && <> <Button variant="ghost" type="button" aria-expanded={all} onClick={() => setAll(v => !v)}
          className="rounded-full bg-muted px-1.5 text-xs font-semibold text-foreground hover:bg-muted h-auto whitespace-normal">{all ? "show fewer" : `+${hidden}`}</Button></>}
      </span> : <span className="text-foreground">{issue.text}</span>}
      <Button variant="ghost" type="button" aria-expanded={open} aria-controls={id} aria-label={`What does “${issue.text}” mean?`} onClick={() => setOpen(v => !v)}
        className="shrink-0 rounded text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring h-auto whitespace-normal"><Info className="h-4 w-4" /></Button>
      {action}
    </div>
    {open && <p id={id} className="ml-4 mt-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">{issue.help}</p>}
  </li>;
}
