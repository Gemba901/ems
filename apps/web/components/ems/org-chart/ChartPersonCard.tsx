"use client";
import { useState, useEffect } from "react";
import { TenantImage } from "@/components/files/TenantImage";
import { active, bodyLabels, type Person } from "./model";
import type { CardMode } from "./chart-layout";
export function Portrait({
  person,
  dark = false,
  large = false,
}: {
  person: Person;
  dark?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.photoUrl]);
  const words = person.name.trim().split(/\s+/);
  const initials = [words[0], words.length > 1 ? words[words.length - 1] : ""]
    .map((w) => Array.from(w ?? "")[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${large ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs"} ${dark ? "bg-white/15 text-white" : "bg-violet-100 text-violet-900"}`}
    >
      {initials}
      {person.photoUrl && !failed && (
        <TenantImage
          src={person.photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
export function ChartPersonCard({
  person,
  colour,
  selected,
  context,
  issues,
  kids,
  expanded,
  onPick,
  onToggle,
  mode = "full",
}: {
  person: Person;
  colour: string;
  selected: boolean;
  context: boolean;
  issues: string[];
  kids: number;
  expanded: boolean;
  onPick: () => void;
  onToggle: () => void;
  mode?: CardMode;
}) {
  const body = !person.managerId
    ? bodyLabels[person.reportsToBody ?? ""]
    : null;
  return (
    <div className="relative h-full">
      <button
        type="button"
        aria-label={`Details for ${person.name}`}
        aria-pressed={selected}
        onClick={onPick}
        title={[
          person.name,
          person.jobTitle,
          person.department?.name,
          body ? `Reports to ${body}` : "",
          ...issues,
        ]
          .filter(Boolean)
          .join(" · ")}
        style={{
          borderLeftColor: colour,
          borderLeftWidth: 6,
          background: selected
            ? "#1e1b4b"
            : mode === "block"
              ? colour
              : undefined,
        }}
        className={`flex h-full w-full flex-col justify-center overflow-hidden rounded-xl border-2 p-2 text-left shadow-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-violet-500 ${selected ? "border-violet-500 text-white ring-2 ring-violet-300" : "bg-white text-slate-900"} ${issues.length || body ? "border-amber-500" : !selected ? "border-slate-300" : ""} ${context ? "border-dashed" : ""}`}
      >
        {mode === "block" ? (
          <span
            aria-hidden="true"
            className="flex w-full items-center justify-center gap-2"
          >
            {selected && <span className="h-7 w-7 rounded-full bg-white" />}
            <span className="text-4xl font-bold text-white">{kids || ""}</span>
          </span>
        ) : (
          <>
            <span className="flex w-full items-center gap-2">
              {mode === "full" && <Portrait person={person} dark={selected} />}
              <strong
                className={`line-clamp-2 min-w-0 leading-tight ${mode === "name" ? "text-xl" : "text-sm"}`}
              >
                {person.name || "Unnamed employee"}
              </strong>
            </span>
            {mode === "full" ? (
              <>
                <span
                  className={`mt-1 block w-full truncate text-xs leading-4 ${selected ? "text-slate-200" : "text-slate-600"}`}
                >
                  {person.jobTitle || "Job title not set"}
                </span>
                <span
                  className={`block w-full truncate text-[11px] leading-4 ${selected ? "text-violet-200" : "text-slate-500"}`}
                >
                  {person.department?.name || "No department"}
                </span>
                <span
                  className={`mt-0.5 block w-full truncate text-[10px] leading-3 ${selected ? "text-slate-200" : "text-slate-600"}`}
                >
                  {body
                    ? `Reports to ${body}`
                    : issues.length
                      ? "Reporting needs review"
                      : !active(person)
                        ? "Inactive · reporting context"
                        : context
                          ? "Reporting context"
                          : person.branch?.name || person.branchText || ""}
                </span>
              </>
            ) : (
              <span
                className={`mt-1 truncate text-sm ${selected ? "text-violet-200" : "text-slate-500"}`}
              >
                {person.jobTitle ?? person.department?.name}
              </span>
            )}
          </>
        )}
      </button>
      {kids > 0 && (
        <button
          type="button"
          className={`absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-violet-600 bg-white px-2 py-0.5 font-bold text-violet-900 shadow-sm ${mode === "block" ? "text-2xl" : "text-xs"}`}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} reports of ${person.name}`}
          onClick={onToggle}
        >
          {expanded ? "−" : "+"} {kids}
        </button>
      )}
    </div>
  );
}
