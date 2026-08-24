"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  ConfirmDeliverySchedulePayload,
  PrepareLogisticsPayload,
  InformIntakePayload,
  CloseHandoverPayload,
} from "@/services/steel-sourcing.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { ScreenSidebar } from "@/components/steel/p02/ScreenSidebar";
import { SubStepCard, Field } from "@/components/steel/p02/shared";
import {
  Loader2,
  Truck,
  Ship,
  Bell,
  ShieldCheck,
  Check,
  Lock,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  PackageCheck,
} from "lucide-react";

// Same authority scope enforced server-side by the sourcing controller's
// PO_ROLES guard on close-handover — kept identical rather than inventing a
// new list.
const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// ── Persistent context (top of screen) ───────────────────────────────────────

function ContextSummary({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sourcing Order Context</CardTitle>
        <p className="text-sm text-slate-500">From S1–S4 — read only.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Sourcing Order</p>
            <p className="font-medium text-slate-800">{order.sourcingNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Production Plan</p>
            <p className="font-medium text-slate-800">{order.plan?.planNumber ?? "—"}</p>
          </div>
          {order.plan?.customerName && (
            <div>
              <p className="text-xs text-slate-400">Customer</p>
              <p className="font-medium text-slate-800">{order.plan.customerName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Material Type</p>
            <p className="font-medium text-slate-800">{order.materialType?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Selected Supplier</p>
            <p className="font-medium text-slate-800">{winner?.supplier?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">PO Number</p>
            <p className="font-medium text-slate-800">{order.poNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">PO Terms</p>
            <p className="font-medium text-slate-800">{order.poDeliveryTerms ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({ order, subStep }: { order: SteelSourcingOrder; subStep: "A09" | "A10" | "A11" | "A12" | "done" }) {
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
            S5 covers delivery confirmation (A09), import logistics where applicable (A10), informing the intake team
            (A11), and closing the sourcing handover (A12) — the final, Management-approved step.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          {order.confirmedDispatchDate || order.confirmedArrivalDate ? (
            <dl className="text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Dispatch</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {order.confirmedDispatchDate ? new Date(order.confirmedDispatchDate).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Arrival</dt>
                <dd className="text-slate-700 font-medium text-right">
                  {order.confirmedArrivalDate ? new Date(order.confirmedArrivalDate).toLocaleDateString() : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Delivery details will appear here once confirmed.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-purple-600" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            {subStep === "A09" && "Once delivery is confirmed, logistics (if applicable) or intake notification follows in this same screen."}
            {subStep === "A10" && "Once logistics is recorded, the intake team can be informed."}
            {subStep === "A11" && "Once the intake team is informed, a Management/Admin role can close the handover."}
            {subStep === "A12" && "Closing the handover is final — it marks this sourcing order CLOSED."}
            {subStep === "done" && "This sourcing order is closed. A P03 material intake can be created separately from P03's own workflow."}
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
            {subStep === "A12" ? (
              <>
                <li>Only Management, Admin, or Super Admin can close the handover.</li>
                <li>Closing does not automatically create a P03 material intake record.</li>
              </>
            ) : (
              <>
                <li>Import logistics fields only apply when the selected supplier is an import source.</li>
                <li>All fields in this section are optional except where marked.</li>
              </>
            )}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A09 — Delivery schedule ───────────────────────────────────────────────────

function DeliveryScheduleForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [dispatch, setDispatch] = useState("");
  const [arrival, setArrival] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: ConfirmDeliverySchedulePayload) => SteelSourcingService.confirmDeliverySchedule(id, payload, token),
    onSuccess: () => {
      toast("Delivery schedule confirmed.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      confirmedDispatchDate: dispatch || undefined,
      confirmedArrivalDate: arrival || undefined,
      vehicleContainerInfo: vehicle || undefined,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Dispatch date <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input type="date" value={dispatch} onChange={(e) => setDispatch(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Expected arrival <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Vehicle / container info <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. MH-12-AB-1234 / container ID" />
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Delivery Schedule →"}
        </Button>
      </div>
    </form>
  );
}

// ── A10 — Logistics ───────────────────────────────────────────────────────────

function LogisticsForm({
  id, token, isImport, onDone,
}: { id: string; token: string; isImport: boolean | null; onDone: () => void }) {
  const { toast } = useToast();
  const [bol, setBol] = useState("");
  const [origin, setOrigin] = useState("");
  const [clearance, setClearance] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: PrepareLogisticsPayload) => SteelSourcingService.prepareLogistics(id, payload, token),
    onSuccess: () => {
      toast(isImport === false ? "Logistics step completed — not required for this route." : "Import logistics recorded.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      billOfLading: bol || undefined,
      countryOfOrigin: origin || undefined,
      portClearanceStatus: clearance || undefined,
      importLogisticsNotes: notes || undefined,
    });
  };

  if (isImport === false) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-sm px-3 py-2.5 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          <span>
            The selected supplier is not marked as an import source, so import logistics (bill of lading, country of
            origin, port clearance) are not required for this order. The workflow still requires this step to be
            confirmed before continuing.
          </span>
        </div>
        <div className="flex items-center justify-end">
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({})} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue — Not Required for This Route →"}
          </Button>
        </div>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {isImport === true && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm px-3 py-2 flex items-start gap-2">
          <Ship className="h-4 w-4 shrink-0 mt-0.5" />
          <span>The selected supplier is an import source — import logistics details apply to this order.</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Bill of lading <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={bol} onChange={(e) => setBol(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Country of origin <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Port clearance status <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={clearance} onChange={(e) => setClearance(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Logistics →"}
        </Button>
      </div>
    </form>
  );
}

// ── A11 — Inform intake team ─────────────────────────────────────────────────

function InformIntakeForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: InformIntakePayload) => SteelSourcingService.informIntakeTeam(id, payload, token),
    onSuccess: () => {
      toast("P03 intake team informed.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({ intakeNotifyNotes: notes || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <p className="text-sm text-slate-500">
        Notify the raw material intake (P03) team that this delivery is on its way so gate, weighbridge, yard, and
        quality staff can prepare to receive it.
      </p>
      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1">
          Notes for the intake team <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. expected vehicle, special handling" />
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inform Intake Team →"}
        </Button>
      </div>
    </form>
  );
}

// ── A12 — Close handover ─────────────────────────────────────────────────────

function ConfirmCloseModal({
  onConfirm, onCancel, submitting,
}: { onConfirm: () => void; onCancel: () => void; submitting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-close-handover-title"
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-red-600" />
          </div>
          <h2 id="confirm-close-handover-title" className="text-base font-bold text-slate-900">Close this sourcing handover?</h2>
        </div>
        <p className="text-sm text-slate-500">
          This is final. The sourcing order will move to <span className="font-medium text-slate-700">CLOSED</span> and
          cannot be reverted from here.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting} className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950">
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting} className="gap-2 bg-red-600 hover:bg-red-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Close Handover"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CloseHandoverPanel({
  id, token, canClose, onDone,
}: { id: string; token: string; canClose: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CloseHandoverPayload) => SteelSourcingService.closeHandover(id, payload, token),
    onSuccess: () => {
      toast("Sourcing handover closed.", "success");
      setConfirming(false);
      onDone();
    },
    onError: (err: Error) => {
      setError(err.message);
      setConfirming(false);
    },
  });

  if (!canClose) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 py-6 flex flex-col items-center text-center gap-3">
        <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Management approval required to close handover</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            Only Management, Admin, or Super Admin roles can close this sourcing handover. Ask a Management or Admin
            user to complete this step.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <p className="text-sm text-slate-500">
          Closing the handover marks this sourcing order <span className="font-medium text-slate-700">CLOSED</span> and
          ends the sourcing workflow. A P03 material intake is created separately, from P03&apos;s own workflow.
        </p>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Handover notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for this handover" />
        </div>
        <div className="flex items-center justify-end">
          <Button type="button" onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
            <ShieldCheck className="h-4 w-4" />
            Close Sourcing Handover
          </Button>
        </div>
      {confirming && (
        <ConfirmCloseModal
          submitting={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate({ handoverNotes: notes || undefined })}
        />
      )}
    </div>
  );
}

// ── S5 / final closed state ──────────────────────────────────────────────────

function ClosedState({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  const deliveryStatus =
    order.confirmedDispatchDate || order.confirmedArrivalDate
      ? [
          order.confirmedDispatchDate ? `Dispatched ${new Date(order.confirmedDispatchDate).toLocaleDateString()}` : null,
          order.confirmedArrivalDate ? `Arrived ${new Date(order.confirmedArrivalDate).toLocaleDateString()}` : null,
        ].filter(Boolean).join(" · ")
      : null;

  return (
    <SubStepCard code="S5" title="Delivery, Logistics & Handover" status="done">
      <div className="py-4 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sourcing Order Closed</h2>
          <p className="text-sm text-slate-500 mt-1">{order.sourcingNumber} is now CLOSED.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm max-w-2xl mx-auto text-left">
          <Field label="PO Number" value={order.poNumber} />
          <Field label="Selected Supplier" value={winner?.supplier?.name} />
          <Field label="Delivery Status" value={deliveryStatus} />
          <Field label="Handover Notes" value={order.handoverNotes} />
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 max-w-md mx-auto">
          This does not automatically create a P03 material intake record. Create one separately when the delivery
          arrives at the gate.
        </div>
        <Link href={`/steel/p03/new?sourcingOrderId=${order.id}`}>
          <Button className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            Create Material Intake in P03 <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </SubStepCard>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S5DeliveryHandover({ order, token }: { order: SteelSourcingOrder; token: string }) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canClose = !!(user?.roleLevel && PO_ROLES.includes(user.roleLevel as Role));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });

  const statusFor = (stage: SteelSourcingOrder["stage"]): "done" | "active" | "locked" => {
    const order5: SteelSourcingOrder["stage"][] = [
      "A08_PO_CREATED",
      "A09_DELIVERY_CONFIRMED",
      "A10_LOGISTICS_PREPARED",
      "A11_INTAKE_INFORMED",
      "A12_HANDOVER_CLOSED",
    ];
    const currentIdx = order5.indexOf(order.stage);
    const targetIdx = order5.indexOf(stage);
    if (currentIdx >= targetIdx) return "done";
    if (currentIdx === targetIdx - 1) return "active";
    return "locked";
  };

  const a09Status = statusFor("A09_DELIVERY_CONFIRMED");
  const a10Status = statusFor("A10_LOGISTICS_PREPARED");
  const a11Status = statusFor("A11_INTAKE_INFORMED");
  const a12Status = statusFor("A12_HANDOVER_CLOSED");
  const closed = order.stage === "A12_HANDOVER_CLOSED";

  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  const isImport = winner?.supplier ? winner.supplier.isImportSource : null;

  const subStep: "A09" | "A10" | "A11" | "A12" | "done" = closed
    ? "done"
    : a09Status === "active"
      ? "A09"
      : a10Status === "active"
        ? "A10"
        : a11Status === "active"
          ? "A11"
          : "A12";

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={PackageCheck}
        title="Delivery, Logistics & Handover"
        subtitle="Confirm delivery, prepare logistics where applicable, and hand the order over to Raw Material Intake."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={closed ? 5 : 4}
        activeIndex={closed ? null : 4}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />
      <ContextSummary order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          {closed ? (
            <ClosedState order={order} />
          ) : (
            <>
              <SubStepCard code="P02-A09" title="Confirm Delivery Schedule With Supplier" status={a09Status}>
                {a09Status === "done" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Dispatch date" value={order.confirmedDispatchDate ? new Date(order.confirmedDispatchDate).toLocaleDateString() : null} />
                    <Field label="Expected arrival" value={order.confirmedArrivalDate ? new Date(order.confirmedArrivalDate).toLocaleDateString() : null} />
                    <Field label="Vehicle / container" value={order.vehicleContainerInfo} />
                  </div>
                ) : a09Status === "active" ? (
                  <DeliveryScheduleForm id={order.id} token={token} onDone={refresh} />
                ) : (
                  <p className="text-sm text-slate-400">Complete the previous step first.</p>
                )}
              </SubStepCard>

              <SubStepCard code="P02-A10" title="Prepare Import Logistics (If Applicable)" status={a10Status}>
                {a10Status === "done" ? (
                  order.billOfLading || order.countryOfOrigin || order.portClearanceStatus ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Bill of lading" value={order.billOfLading} />
                      <Field label="Country of origin" value={order.countryOfOrigin} />
                      <Field label="Port clearance" value={order.portClearanceStatus} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">Not required for this route — step completed.</p>
                  )
                ) : a10Status === "active" ? (
                  <LogisticsForm id={order.id} token={token} isImport={isImport} onDone={refresh} />
                ) : (
                  <p className="text-sm text-slate-400">Complete the previous step first.</p>
                )}
              </SubStepCard>

              <SubStepCard code="P02-A11" title="Inform Raw Material Intake Team" status={a11Status}>
                {a11Status === "done" ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-50 text-emerald-700">P03 Intake Team Informed</Badge>
                    <Field label="" value={order.intakeInformedAt ? new Date(order.intakeInformedAt).toLocaleString() : null} />
                  </div>
                ) : a11Status === "active" ? (
                  <InformIntakeForm id={order.id} token={token} onDone={refresh} />
                ) : (
                  <p className="text-sm text-slate-400">Complete the previous step first.</p>
                )}
              </SubStepCard>

              <div className="relative">
                <div className="flex items-center gap-2 mb-1 px-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-xs font-medium text-red-500 uppercase tracking-wide">Final Closing / Authority Gate</p>
                </div>
                <SubStepCard code="P02-A12" title="Close Sourcing Handover to Intake" status={a12Status}>
                  {a12Status === "active" ? (
                    <CloseHandoverPanel id={order.id} token={token} canClose={canClose} onDone={refresh} />
                  ) : (
                    <p className="text-sm text-slate-400">Complete the previous step first.</p>
                  )}
                </SubStepCard>
              </div>
            </>
          )}
        </div>
        <Sidebar order={order} subStep={subStep} />
      </div>
    </div>
  );
}
