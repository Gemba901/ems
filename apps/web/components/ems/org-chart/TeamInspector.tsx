"use client";
import { useState } from "react";
import Link from "next/link";
import { Portrait } from "./ChartPersonCard";
import { active, type Person } from "./model";
import { teamContext, type ChartView } from "./chart-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function TeamInspector({
  view,
  id,
  colour,
  issues,
  onPick,
  onFocus,
  onClose,
  onProfile,
}: {
  view: ChartView;
  id: string;
  colour: (p: Person) => string;
  issues: string[];
  onPick: (id: string) => void;
  onFocus: (id: string) => void;
  onClose: () => void;
  onProfile: (id: string) => void;
}) {
  const [limit, setLimit] = useState(12),
    [term, setTerm] = useState("");
  const context = teamContext(view, id);
  if (!context) return null;
  const { person, direct, manager, colleagues, path, body, descendants } =
    context;
  const team = direct.length ? direct : colleagues;
  const filtered = team.filter((p) =>
    `${p.name} ${p.jobTitle ?? ""} ${p.department?.name ?? ""}`
      .toLocaleLowerCase()
      .includes(term.toLocaleLowerCase()),
  );
  return (
    <section
      aria-label="Selected person and team"
      className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
          Selected person & team
        </h2>
        <Button variant="ghost"
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-muted-foreground underline h-auto whitespace-normal"
        >
          Close details
        </Button>
      </div>
      <nav
        aria-label="Reporting line"
        className="flex flex-wrap items-center gap-1 px-4 py-3 text-xs"
      >
        {body && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary">
            {body}
          </span>
        )}
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            {(i > 0 || body) && (
              <span aria-hidden="true" className="text-muted-foreground">
                ›
              </span>
            )}
            <Button variant="ghost"
              type="button"
              aria-current={p.id === id ? "true" : undefined}
              onClick={() => onPick(p.id)}
              className={`h-auto whitespace-normal rounded px-1 py-1 ${p.id === id ? "font-bold text-foreground" : "text-primary hover:underline"}`}
            >
              {p.name}
            </Button>
          </span>
        ))}
      </nav>
      <div
        className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-xl border-l-[6px] bg-primary p-4 text-primary-foreground"
        style={{ borderLeftColor: colour(person) }}
      >
        <Portrait person={person} dark large />
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-bold">{person.name}</h3>
          <p className="text-sm text-primary-foreground">
            {person.jobTitle || "Job title not set"} ·{" "}
            {person.department?.name || "No department"}
          </p>
          <p className="mt-1 text-xs text-primary-foreground">
            {person.branch?.name || person.branchText || "No branch"} ·{" "}
            {direct.length} direct reports · {descendants} in the full reporting
            team
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/ems/employees/${encodeURIComponent(id)}`}
            onClick={() => onProfile(id)}
            className="rounded-lg bg-card px-3 py-2 text-xs font-bold text-primary"
          >
            Open profile
          </Link>
          {person.department && (
            <Link
              href="/ems/departments"
              onClick={() => onProfile(id)}
              className="rounded-lg border border-primary/50 px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              Department directory
            </Link>
          )}
          <Button variant="ghost"
            type="button"
            onClick={() => onFocus(id)}
            className="rounded-lg border border-primary/50 px-3 py-2 text-xs font-bold text-primary-foreground h-auto whitespace-normal"
          >
            Isolate this team
          </Button>
        </div>
      </div>
      {(issues.length > 0 || !view.connected.has(id) || !active(person)) && (
        <p className="mx-4 mb-4 rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
          {[
            ...issues,
            ...(!view.connected.has(id)
              ? ["This chain has no complete saved path to a reporting body."]
              : []),
            ...(!active(person) ? ["Inactive employee."] : []),
          ].join(" ")}
        </p>
      )}
      <div className="border-t border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {direct.length
              ? `${person.name}’s direct reports`
              : manager
                ? `${person.name} works in ${manager.name}’s team`
                : "No direct reports"}
            {team.length > 0 ? ` · ${team.length}` : ""}
          </h3>
          {team.length > 12 && (
            <Input
              aria-label="Find in selected team"
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
              placeholder="Find in this team"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setLimit(12);
              }}
            />
          )}
        </div>
        {team.length > 0 ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, limit).map((p) => (
                <li key={p.id}>
                  <Button variant="ghost"
                    type="button"
                    aria-label={`Select ${p.name}`}
                    aria-pressed={p.id === id}
                    onClick={() => onPick(p.id)}
                    style={{ borderLeftColor: colour(p) }}
                    className={`h-auto whitespace-normal flex w-full items-center gap-2 rounded-xl border border-l-4 p-3 text-left ${p.id === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}
                  >
                    <Portrait person={p} dark={p.id === id} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {p.name}
                      </strong>
                      <span
                        className={`block truncate text-xs ${p.id === id ? "text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        {p.jobTitle || "Job title not set"}
                      </span>
                    </span>
                    <span className="text-xs">
                      {(view.children.get(p.id) ?? []).length > 0
                        ? `${view.children.get(p.id)!.length} ↓`
                        : "›"}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            {!filtered.length && (
              <p className="text-sm text-muted-foreground">
                No matching team members.
              </p>
            )}
            {filtered.length > limit && (
              <Button variant="ghost"
                type="button"
                onClick={() => setLimit((n) => n + 24)}
                className="mt-3 text-sm font-semibold text-primary underline h-auto whitespace-normal"
              >
                Show more ({filtered.length - limit} remaining)
              </Button>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Team details use saved reporting links across the company; they
              can include people outside the chart filters.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No team is linked to this person.
          </p>
        )}
      </div>
    </section>
  );
}
