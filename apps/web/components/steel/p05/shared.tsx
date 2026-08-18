"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Lock, Loader2 } from "lucide-react";
import type { SteelMelting } from "@/services/steel-melting.service";

export type SubStepStatus = "done" | "active" | "locked";

export type StepProps = {
  melting: SteelMelting;
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

export function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}
