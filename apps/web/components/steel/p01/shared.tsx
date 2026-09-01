"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Lock, Loader2 } from "lucide-react";

export type SubStepStatus = "done" | "active" | "locked";

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: SubStepStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
        <Circle className="h-3.5 w-3.5 fill-blue-100" /> In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
      <Lock className="h-3 w-3" /> Locked
    </span>
  );
}

export function SubStepCard({
  code, title, status, children,
}: { code: string; title: string; status: SubStepStatus; children: React.ReactNode }) {
  return (
    <Card className={status === "locked" ? "opacity-70" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm">
            <span className="text-slate-400 font-mono text-xs mr-1.5">{code}</span>
            {title}
          </CardTitle>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{label}</>;
}

export function LockedNote() {
  return <p className="text-sm text-slate-400">Complete the previous step first.</p>;
}

/**
 * Renders a section as an always-visible card with a status badge next to
 * its heading (done / in progress / locked). Content is never collapsed —
 * locked sections are shown at reduced opacity.
 */
export function SubStep({
  code, title, status, children,
}: { code: string; title: string; status: SubStepStatus; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <SubStepCard code={code} title={title} status={status}>
      {children}
    </SubStepCard>
  );
}

export function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}
