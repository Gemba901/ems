"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Lock, Loader2 } from "lucide-react";
import type { SteelHeatApproval } from "@/services/steel-heat-approval.service";

export type SubStepStatus = "done" | "active" | "locked";

export type StepProps = {
  heatApproval: SteelHeatApproval;
  token: string;
  onSaved: () => void;
  onError: (err: unknown) => void;
};

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value}</p>
    </div>
  );
}

export function SubStepCard({
  code, title, status, children,
}: { code: string; title: string; status: SubStepStatus; children: React.ReactNode }) {
  return (
    <Card className={status === "locked" ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          {status === "active" && <Circle className="h-4 w-4 text-blue-500 fill-blue-100" />}
          {status === "locked" && <Lock className="h-3.5 w-3.5 text-slate-400" />}
          <CardTitle className="text-sm">
            <span className="text-slate-400 font-mono text-xs mr-1.5">{code}</span>
            {title}
          </CardTitle>
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
 * Collapsed 1-line summary row for a completed sub-step. Use instead of a
 * full SubStepCard once a step is done, to avoid a long stack of full cards.
 */
export function SubStepSummary({ code, title, summary }: { code: string; title: string; summary?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-100 bg-emerald-50/40">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      <span className="text-slate-400 font-mono text-xs shrink-0">{code}</span>
      <span className="text-sm text-slate-700 truncate">{summary ?? title}</span>
    </div>
  );
}

/** Minimal collapsed placeholder row for a locked sub-step. */
export function SubStepLocked({ code, title }: { code: string; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-100 opacity-50">
      <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <span className="text-slate-400 font-mono text-xs shrink-0">{code}</span>
      <span className="text-sm text-slate-400 truncate">{title}</span>
    </div>
  );
}

/**
 * Wraps a sub-step's rendering per status: full card while active, a
 * 1-line summary once done, and a minimal placeholder while locked.
 */
export function SubStep({
  code, title, status, summary, children,
}: { code: string; title: string; status: SubStepStatus; summary?: React.ReactNode; children: React.ReactNode }) {
  if (status === "done") return <SubStepSummary code={code} title={title} summary={summary} />;
  if (status === "locked") return <SubStepLocked code={code} title={title} />;
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
