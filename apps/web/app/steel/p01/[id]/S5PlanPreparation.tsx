"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  SteelProductionPlan,
  SteelDepartment,
  SteelProductionSequenceItem,
  PrepareProductionPlanPayload,
  CommunicatePlanPayload,
} from "@/services/steel.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/p01/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/p01/ScreenHeader";
import { ScreenSidebar } from "@/components/steel/p01/ScreenSidebar";
import {
  Loader2,
  CalendarClock,
  Plus,
  Trash2,
  Check,
  Circle,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Send,
  ClipboardCheck,
  ClipboardEdit,
} from "lucide-react";

const STATUS_BADGE_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_BADGE_STYLES[status] ?? "bg-slate-100 text-slate-600"}>
      {status.replace(/_/g, " ").replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase())}
    </Badge>
  );
}

function CurrentTaskBanner({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
      <ClipboardEdit className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
      <p className="text-sm text-blue-900">
        <span className="font-semibold">What to do now: </span>
        {text}
      </p>
    </div>
  );
}

const ALL_DEPARTMENTS: SteelDepartment[] = [
  "PROCUREMENT", "YARD", "FURNACE", "CCM", "ROLLING", "QUALITY", "MAINTENANCE", "STORES", "DISPATCH",
];

function ContextSummary({ plan }: { plan: SteelProductionPlan }) {
  const qty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Context</CardTitle>
        <p className="text-sm text-slate-500">From S1–S4 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Plan</p>
            <p className="font-medium text-slate-800">{plan.planNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Product</p>
            <p className="font-medium text-slate-800">{plan.productType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Grade</p>
            <p className="font-medium text-slate-800">{plan.grade ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Quantity</p>
            <p className="font-medium text-slate-800">{qty} t</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Route</p>
            <p className="font-medium text-slate-800">{plan.plantRoute?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Priority</p>
            <p className="font-medium text-slate-800">{plan.priority?.replace(/_/g, " ") ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeasibilitySummary({ plan }: { plan: SteelProductionPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmed Feasibility</CardTitle>
        <p className="text-sm text-slate-500">From S4 — route, material and capacity readiness.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Route</p>
            <p className="font-medium text-slate-800">{plan.plantRoute?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Material</p>
            <p className="font-medium text-slate-800">{plan.materialAvailability?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Equipment</p>
            <p className="font-medium text-slate-800">{plan.equipmentAvailability?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Manpower</p>
            <p className="font-medium text-slate-800">{plan.manpowerAvailability?.replace(/_/g, " ") ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Sidebar({ plan, subStep }: { plan: SteelProductionPlan; subStep: "A10" | "A11" | "done" }) {
  const qty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  const acks = plan.departmentAcks;
  const ackedCount = acks.filter((a) => a.acknowledged).length;

  return (
    <ScreenSidebar>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            S5 covers P01-A10 (draft the production sequence and schedule) and P01-A11 (communicate the plan to
            departments and track their acknowledgement).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Plan ID</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.planNumber}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Product</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.productType?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Grade</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.grade ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Quantity</dt>
              <dd className="text-slate-700 font-medium text-right">{qty} t</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Route</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.plantRoute?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feasibility</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Material</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.materialAvailability?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Equipment</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.equipmentAvailability?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Manpower</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.manpowerAvailability?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {plan.plannedStartDate || plan.plannedEndDate ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Start</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {plan.plannedStartDate ? new Date(plan.plannedStartDate).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">End</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {plan.plannedEndDate ? new Date(plan.plannedEndDate).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">The schedule will appear here once the production plan is saved.</p>
          )}
        </CardContent>
      </Card>

      {plan.planCommunicatedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Acknowledgement</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-700 font-medium">
              {ackedCount}/{acks.length} departments acknowledged
            </p>
            <p className={"text-xs mt-1 " + (ackedCount === acks.length && acks.length > 0 ? "text-emerald-600" : "text-amber-600")}>
              {ackedCount === acks.length && acks.length > 0 ? "Ready for release" : "Awaiting acknowledgement"}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-purple-600" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            {subStep === "A10" && "Once the production plan is saved, you'll communicate it to departments in this same screen."}
            {subStep === "A11" && "Once departments are notified, track their acknowledgement here before release."}
            {subStep === "done" && "S6 — Plan Release."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            {subStep === "A10" && (
              <>
                <li>Add one row per production batch — batch number is required.</li>
                <li>Planned end date must not be before the planned start date.</li>
              </>
            )}
            {(subStep === "A11" || subStep === "done") && (
              <li>Release requires every notified department to acknowledge the plan.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A10 — Production plan & sequence ─────────────────────────────────────────

function ProductionPlanForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<SteelProductionSequenceItem[]>([{ batch: "1" }]);
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: PrepareProductionPlanPayload) => SteelService.prepareProductionPlan(planId, payload, token),
    onSuccess: () => {
      toast("Production plan saved — communicate it to departments next.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateItem = (i: number, patch: Partial<SteelProductionSequenceItem>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = items.filter((it) => it.batch.trim());
    if (valid.length === 0) {
      setError("Add at least one production batch.");
      return;
    }
    if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate) {
      setError("Planned end date must not be before the planned start date.");
      return;
    }
    mutation.mutate({
      productionSequence: valid,
      plannedStartDate: plannedStartDate || undefined,
      plannedEndDate: plannedEndDate || undefined,
      planNotes: planNotes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Production Sequence</CardTitle>
          <p className="text-sm text-slate-500">One row per production batch — batch number is required.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr_1fr] gap-2 flex-1">
                  <Input placeholder="Batch #" value={item.batch} onChange={(e) => updateItem(i, { batch: e.target.value })} />
                  <Input placeholder="Description (optional)" value={item.description || ""} onChange={(e) => updateItem(i, { description: e.target.value })} />
                  <Input
                    type="number"
                    placeholder="Qty (t)"
                    value={item.quantityTonnes ?? ""}
                    onChange={(e) => updateItem(i, { quantityTonnes: e.target.value ? Number(e.target.value) : undefined })}
                  />
                  <Input type="date" value={item.sequenceDate || ""} onChange={(e) => updateItem(i, { sequenceDate: e.target.value })} />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={items.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="gap-1.5"
              onClick={() => setItems((prev) => [...prev, { batch: String(prev.length + 1) }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add batch
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Planned start date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} max={plannedEndDate || undefined} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">
                Planned end date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} min={plannedStartDate || undefined} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Plan notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Optional" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Production Plan →"}
        </Button>
      </div>
    </form>
  );
}

// ── A11 — Communicate to departments ─────────────────────────────────────────

function CommunicateForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<SteelDepartment[]>(ALL_DEPARTMENTS);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CommunicatePlanPayload) => SteelService.communicatePlan(planId, payload, token),
    onSuccess: () => {
      toast("Plan communicated — tracking department acknowledgement.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggle = (d: SteelDepartment) => {
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) {
      setError("Select at least one department.");
      return;
    }
    mutation.mutate({ departments: selected, notes: notes || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Departments to Notify</CardTitle>
          <p className="text-sm text-slate-500">Select who needs this production plan.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_DEPARTMENTS.map((d) => {
              const isSelected = selected.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(d)}
                  aria-pressed={isSelected}
                  className={
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (isSelected
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                  }
                >
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Communication notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <>
              <Send className="h-4 w-4" />
              Communicate Production Plan
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ── Acknowledgement board ────────────────────────────────────────────────────

function AckRow({
  planId, ack, token, onDone,
}: {
  planId: string;
  ack: SteelProductionPlan["departmentAcks"][number];
  token: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => SteelService.acknowledgeDepartment(planId, ack.department, { acknowledged: true }, token),
    onSuccess: () => onDone(),
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5">
      <span className="text-sm text-slate-700 font-medium">{ack.department.charAt(0) + ack.department.slice(1).toLowerCase()}</span>
      {ack.acknowledged ? (
        <Badge className="bg-emerald-50 text-emerald-700 gap-1">
          <Check className="h-3 w-3" />
          Acknowledged
        </Badge>
      ) : (
        <Button size="xs" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Acknowledge"}
        </Button>
      )}
    </div>
  );
}

function AcknowledgementBoard({
  plan, token, onDone, onContinue,
}: { plan: SteelProductionPlan; token: string; onDone: () => void; onContinue: () => void }) {
  const ackedCount = plan.departmentAcks.filter((a) => a.acknowledged).length;
  const total = plan.departmentAcks.length;
  const allAcked = total > 0 && ackedCount === total;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-purple-600" />
            Department Acknowledgement
          </CardTitle>
          <p className="text-sm text-slate-500">
            Communicated on {plan.planCommunicatedAt ? new Date(plan.planCommunicatedAt).toLocaleString() : "—"}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.departmentAcks.map((ack) => (
              <AckRow key={ack.id} planId={plan.id} ack={ack} token={token} onDone={onDone} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {ackedCount}/{total} departments acknowledged
              </p>
              <p className={"text-xs mt-0.5 " + (allAcked ? "text-emerald-600" : "text-amber-600")}>
                {allAcked ? "Ready for release" : "Awaiting department acknowledgement"}
              </p>
            </div>
            <Badge className={allAcked ? "bg-emerald-50 text-emerald-700 gap-1" : "bg-amber-50 text-amber-700 gap-1"}>
              {allAcked ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              {allAcked ? "Ready for Release" : "Awaiting Acknowledgement"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {allAcked && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <Check className="h-4 w-4" />
              S5 Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm text-slate-600 space-y-1">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Production plan prepared</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Departments notified</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-500" /> Required acknowledgements complete</li>
            </ul>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              Next: <span className="font-medium text-slate-700">S6 — Plan Release</span>
            </div>
            <Button onClick={onContinue} className="gap-2">
              Continue to S6 — Plan Release <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S5PlanPreparation({
  plan, token, onRefresh, onContinue,
}: { plan: SteelProductionPlan; token: string; onRefresh: () => void; onContinue: () => void }) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  let subStep: "A10" | "A11" | "done" = "A10";
  let body: React.ReactNode;

  if (plan.stage === "A09_CAPACITY_CHECKED") {
    subStep = "A10";
    body = <ProductionPlanForm planId={plan.id} token={token} onDone={refresh} />;
  } else if (plan.stage === "A10_PLAN_DRAFTED") {
    subStep = "A11";
    body = <CommunicateForm planId={plan.id} token={token} onDone={refresh} />;
  } else {
    // stage === A11_PLAN_COMMUNICATED
    const allAcked = plan.departmentAcks.length > 0 && plan.departmentAcks.every((a) => a.acknowledged);
    subStep = allAcked ? "done" : "A11";
    body = <AcknowledgementBoard plan={plan} token={token} onDone={refresh} onContinue={onContinue} />;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={CalendarClock}
        title="Plan Preparation & Communication"
        subtitle={`${plan.planNumber} — build the production sequence, schedule the plan and confirm department acknowledgement.`}
        rightContent={<StatusBadge status={plan.status} />}
      />
      <WorkflowIndicator doneCount={4} activeIndex={4} />
      <ContextSummary plan={plan} />
      {(plan.stage === "A09_CAPACITY_CHECKED") && <FeasibilitySummary plan={plan} />}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          {subStep === "A10" && <CurrentTaskBanner text="Build the production sequence and set the planned schedule." />}
          {subStep === "A11" && plan.stage === "A10_PLAN_DRAFTED" && (
            <CurrentTaskBanner text="Select the departments that need to be notified about this plan." />
          )}
          {subStep === "A11" && plan.stage === "A11_PLAN_COMMUNICATED" && (
            <CurrentTaskBanner text="Follow up with departments that haven't acknowledged the plan yet." />
          )}
          {body}
        </div>
        <Sidebar plan={plan} subStep={subStep} />
      </div>
    </div>
  );
}
