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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { DocSection, DocGrid, DocField, SummaryBlock, ErrorBanner, P02Layout, P02InfoCard } from "@/components/steel/p02/document";
import { AttachmentPanel } from "@/components/steel/p02/AttachmentPanel";
import { Loader2, Ship, Check, ArrowRight, PackageCheck } from "lucide-react";

// Same authority scope enforced server-side by the sourcing controller's
// PO_ROLES guard on close-handover — kept identical rather than inventing a
// new list.
const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

// ── Order reference header (always visible, read-only) ──────────────────────

function OrderReferenceHeader({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  return (
    <DocGrid cols={4}>
      <DocField label="Sourcing Order" value={order.sourcingNumber} source="From Purchase Order" />
      <DocField label="Selected Supplier" value={winner?.supplier?.name} source="From Purchase Order" />
      <DocField label="PO Number" value={order.poNumber} source="From Purchase Order" />
      <DocField label="PO Terms" value={order.poDeliveryTerms} source="From Purchase Order" />
    </DocGrid>
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
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <DocGrid>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Dispatch date (optional)</label>
          <Input className="h-8" type="date" value={dispatch} onChange={(e) => setDispatch(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Expected arrival (optional)</label>
          <Input className="h-8" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </div>
      </DocGrid>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Vehicle / container info (optional)</label>
        <Input className="h-8" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. MH-12-AB-1234 / container ID" />
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
      <div className="space-y-3">
        <SummaryBlock tone="neutral">
          The selected supplier is not marked as an import source, so import logistics (bill of lading, country of
          origin, port clearance) are not required for this order. The workflow still requires this step to be
          confirmed before continuing.
        </SummaryBlock>
        <div className="flex items-center justify-end">
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({})} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue — Not Required for This Route →"}
          </Button>
        </div>
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {isImport === true && (
        <SummaryBlock tone="info">
          The selected supplier is an import source — import logistics details apply to this order.
        </SummaryBlock>
      )}
      <DocGrid>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Bill of lading (optional)</label>
          <Input className="h-8" value={bol} onChange={(e) => setBol(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Country of origin (optional)</label>
          <Input className="h-8" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Port clearance status (optional)</label>
          <Input className="h-8" value={clearance} onChange={(e) => setClearance(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
          <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </DocGrid>
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
      toast("P03 intake visibility updated.", "success");
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
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <p className="text-sm text-muted-foreground">
        This makes the delivery visible to Raw Material Intake (P03) so gate, weighbridge, yard, and quality staff
        can prepare to receive it.
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Notes for intake (optional)</label>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. expected vehicle, special handling" />
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Ready for Intake →"}
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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-background shadow-xl border border-input p-5 space-y-4">
        <h2 className="text-sm font-semibold">Close this sourcing handover?</h2>
        <p className="text-sm text-muted-foreground">
          This is final. The sourcing order will move to <span className="font-medium text-foreground">CLOSED</span> and
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
      <SummaryBlock tone="warning">
        <span className="font-medium">Management approval required to close handover.</span> Only Management, Admin,
        or Super Admin roles can close this sourcing handover. Ask a Management or Admin user to complete this step.
      </SummaryBlock>
    );
  }

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <p className="text-sm text-muted-foreground">
        Closing the handover marks this sourcing order <span className="font-medium text-foreground">CLOSED</span> and
        ends the sourcing workflow. A P03 material intake is created separately, from P03&apos;s own workflow.
      </p>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Handover notes (optional)</label>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for this handover" />
      </div>
      <div className="flex items-center justify-end">
        <Button type="button" onClick={() => setConfirming(true)} className="gap-2 bg-red-600 hover:bg-red-700">
          Complete P02 Handover
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

// ── Final handover summary ───────────────────────────────────────────────────

function HandoverSummary({ order }: { order: SteelSourcingOrder }) {
  const winner = order.quotations.find((q) => q.supplierId === order.selectedSupplierId);
  const deliveryStatus =
    order.confirmedDispatchDate || order.confirmedArrivalDate
      ? [
          order.confirmedDispatchDate ? `Dispatched ${new Date(order.confirmedDispatchDate).toLocaleDateString()}` : null,
          order.confirmedArrivalDate ? `Arrived ${new Date(order.confirmedArrivalDate).toLocaleDateString()}` : null,
        ].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-900">Sourcing order {order.sourcingNumber} handed over to P03 — Raw Material Intake</p>
      </div>
      <DocGrid cols={4}>
        <DocField label="PO Number" value={order.poNumber} />
        <DocField label="Selected Supplier" value={winner?.supplier?.name} />
        <DocField label="Delivery Status" value={deliveryStatus} />
        <DocField label="Handover Notes" value={order.handoverNotes} />
      </DocGrid>
      <p className="text-xs text-emerald-800">
        This does not automatically create a P03 material intake record. Create one separately when the delivery
        arrives at the gate.
      </p>
      <Link href={`/steel/p03/new?sourcingOrderId=${order.id}`}>
        <Button className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          Create Material Intake in P03 <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
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

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <ScreenHeader
        icon={PackageCheck}
        title="Delivery & Handover"
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

      <P02Layout
        info={
          <P02InfoCard
            alreadyProvided="Supplier, material, PO number, quantity, and required date, from the purchase order."
            whatToEnter="Actual/confirmed delivery dates, logistics/import details where applicable, and handover notes."
            beforeYouContinue={["Delivery schedule is confirmed.", "P03 has what it needs for intake."]}
          />
        }
      >
      <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
        <DocSection number="—" title="Purchase Order Reference" first>
          <OrderReferenceHeader order={order} />
        </DocSection>

        {closed ? (
          <DocSection number="12" title="Handover">
            <HandoverSummary order={order} />
          </DocSection>
        ) : (
          <>
            <DocSection number="09" title="Delivery Schedule" status={a09Status}>
              {a09Status === "done" ? (
                <DocGrid cols={3}>
                  <DocField label="Dispatch date" value={order.confirmedDispatchDate ? new Date(order.confirmedDispatchDate).toLocaleDateString() : null} />
                  <DocField label="Expected arrival" value={order.confirmedArrivalDate ? new Date(order.confirmedArrivalDate).toLocaleDateString() : null} />
                  <DocField label="Vehicle / container" value={order.vehicleContainerInfo} />
                </DocGrid>
              ) : a09Status === "active" ? (
                <DeliveryScheduleForm id={order.id} token={token} onDone={refresh} />
              ) : (
                <p className="text-sm text-muted-foreground">Delivery schedule needed — confirm dispatch/arrival to continue.</p>
              )}
            </DocSection>

            <DocSection number="10" title="Logistics" status={a10Status} action={isImport === true ? <Ship className="h-3.5 w-3.5 text-blue-500" /> : undefined}>
              {a10Status === "done" ? (
                order.billOfLading || order.countryOfOrigin || order.portClearanceStatus ? (
                  <DocGrid cols={3}>
                    <DocField label="Bill of lading" value={order.billOfLading} />
                    <DocField label="Country of origin" value={order.countryOfOrigin} />
                    <DocField label="Port clearance" value={order.portClearanceStatus} />
                  </DocGrid>
                ) : (
                  <p className="text-sm text-muted-foreground">Not required for this route — section completed.</p>
                )
              ) : a10Status === "active" ? (
                <LogisticsForm id={order.id} token={token} isImport={isImport} onDone={refresh} />
              ) : (
                <p className="text-sm text-muted-foreground">Confirm the delivery schedule above before logistics.</p>
              )}
              {a09Status === "done" && (
                <div className="mt-3">
                  <AttachmentPanel sourcingId={order.id} stage="A09_DELIVERY_CONFIRMED" token={token} label="Delivery & Shipping Documents" />
                </div>
              )}
            </DocSection>

            <DocSection number="11" title="Intake Preparation" status={a11Status}>
              {a11Status === "done" ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700">Visible to P03 Intake</Badge>
                  {order.intakeInformedAt && <span className="text-xs text-muted-foreground">{new Date(order.intakeInformedAt).toLocaleString()}</span>}
                </div>
              ) : a11Status === "active" ? (
                <InformIntakeForm id={order.id} token={token} onDone={refresh} />
              ) : (
                <p className="text-sm text-muted-foreground">Logistics required — complete it above before informing intake.</p>
              )}
            </DocSection>

            <DocSection number="12" title="Handover" status={a12Status}>
              {a12Status === "active" ? (
                <CloseHandoverPanel id={order.id} token={token} canClose={canClose} onDone={refresh} />
              ) : a12Status !== "done" ? (
                <p className="text-sm text-muted-foreground">Intake preparation required — confirm it above to continue.</p>
              ) : null}
            </DocSection>
          </>
        )}
      </div>
      </P02Layout>
    </div>
  );
}
