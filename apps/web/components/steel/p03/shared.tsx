"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { SteelIntakeStatus, SteelMaterialIntake } from "@/services/material-intake.service";

/** A single labeled read-only value — used for compact inline summaries (e.g. sidebar dl blocks, terminal-state grids). */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

export function SelectField({
  label, value, onChange, options, required,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{label}</>;
}

// Presentational status a material intake can be in from a user's point of
// view — a small derived read of (status, acceptanceDecision), not a new
// backend concept. "Inspection" and "Accepted" both correspond to the real
// IN_PROGRESS status; splitting them here is display-only.
const INTAKE_STATUS_BADGE_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Inspection: "bg-blue-50 text-blue-700",
  Accepted: "bg-emerald-50 text-emerald-700",
  Hold: "bg-amber-50 text-amber-700",
  Rejected: "bg-red-50 text-red-700",
  Released: "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-red-50 text-red-700",
};

export function intakeStatusLabel(status: SteelIntakeStatus, acceptanceDecision: SteelMaterialIntake["acceptanceDecision"]): string {
  if (status === "DRAFT") return "Draft";
  if (status === "ON_HOLD") return "Hold";
  if (status === "REJECTED") return "Rejected";
  if (status === "RELEASED") return "Released";
  if (status === "CANCELLED") return "Cancelled";
  // IN_PROGRESS
  return acceptanceDecision === "ACCEPT" ? "Accepted" : "Inspection";
}

export function IntakeStatusBadge({ intake }: { intake: SteelMaterialIntake }) {
  const label = intakeStatusLabel(intake.status, intake.acceptanceDecision);
  return <Badge className={INTAKE_STATUS_BADGE_STYLES[label] ?? "bg-muted text-muted-foreground"}>{label}</Badge>;
}
