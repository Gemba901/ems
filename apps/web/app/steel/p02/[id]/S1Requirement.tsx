"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelSourcingService,
  SteelSourcingOrder,
  IdentifyMaterialTypePayload,
} from "@/services/steel-sourcing.service";
import { SteelConfigService, ConfigMaterial } from "@/services/steel-config.service";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkflowIndicator } from "@/components/steel/WorkflowIndicator";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { STEEL_PROCESSES } from "@/components/steel/dashboard/steelProcesses";
import { SCREENS } from "@/components/steel/p02/screenMap";
import { DocSection, DocGrid, DocField, SummaryBlock, ErrorBanner, P02Layout, P02InfoCard } from "@/components/steel/p02/document";
import { encodeMaterialNotes, decodeMaterialCode, decodeUserNotes } from "@/components/steel/p02/materialRef";
import { Loader2, ClipboardList, Check } from "lucide-react";

// ── 01 · Production Requirement (A01, read-only recap of P01) ───────────────

function ProductionRequirement({ order }: { order: SteelSourcingOrder }) {
  const fromPlan = "From Production Plan";
  return (
    <DocGrid cols={2}>
      <DocField label="Production Plan" value={order.plan?.planNumber} source={fromPlan} />
      <DocField label="Customer / Dealer" value={order.plan?.customerName ?? order.plan?.dealerName} source={fromPlan} />
      <DocField label="Product" value={order.plan?.productType?.replace(/_/g, " ")} source={fromPlan} />
      <DocField label="Grade / Size" value={[order.plan?.grade, order.plan?.size].filter(Boolean).join(" / ") || null} source={fromPlan} />
      <DocField label="Plant Route" value={order.plan?.plantRoute} source={fromPlan} />
      <DocField label="Requested Quantity" value={order.plan ? `${order.plan.requestedQuantityTonnes} t` : null} source={fromPlan} />
      <DocField label="Required By" value={order.requiredByDate ? new Date(order.requiredByDate).toLocaleDateString() : null} source={fromPlan} />
      <DocField
        label="Expected Delivery (P01)"
        value={order.plan?.expectedDeliveryDate ? new Date(order.plan.expectedDeliveryDate).toLocaleDateString() : null}
        source={fromPlan}
      />
      <DocField label="Requirement Notes" value={order.materialRequirementNotes} source={fromPlan} />
    </DocGrid>
  );
}

// ── 02 · Material Classification (A02) — driven by the Material Master ──────

// P02 requires the Material Master wherever any materials are configured —
// there is no manual/arbitrary material entry path once Configuration has
// records. Only when zero materials exist does this show a blocking empty
// state pointing at Configuration, rather than silently accepting an
// uncontrolled value.
function MaterialClassificationForm({ id, token, onDone }: { id: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const materialsQuery = useQuery({
    queryKey: ["steel-config-materials", "active"],
    queryFn: () => SteelConfigService.listMaterials(token),
    enabled: !!token,
  });
  const [materialId, setMaterialId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const materials = materialsQuery.data ?? [];
  // Auto-preselect a sensible default so the user isn't forced to pick from
  // scratch every time: prefer a material Configuration has flagged as
  // "frequently sourced" and classified, falling back to the first classified
  // material. Never auto-selects an unclassified record — that still requires
  // fixing in Configuration first. This is a derived default, not stored
  // state: once the user picks something explicitly, materialId wins.
  const autoPickId =
    materials.find((m) => m.frequentlySourced && m.materialType)?.id ??
    materials.find((m) => m.materialType)?.id ??
    "";
  const effectiveMaterialId = materialId || autoPickId;
  const selectedMaterial = materials.find((m) => m.id === effectiveMaterialId) ?? null;

  const mutation = useMutation({
    mutationFn: (payload: IdentifyMaterialTypePayload) => SteelSourcingService.identifyMaterialType(id, payload, token),
    onSuccess: () => {
      toast("Material confirmed — continue to supplier assessment.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedMaterial) {
      setError("Select a material from the Material Master.");
      return;
    }
    if (!selectedMaterial.materialType) {
      setError(`"${selectedMaterial.name}" has no Material Type set in Configuration — update it there before using it here.`);
      return;
    }
    mutation.mutate({
      materialType: selectedMaterial.materialType,
      materialTypeNotes: encodeMaterialNotes(selectedMaterial.code, notes),
    });
  };

  if (materialsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (materialsQuery.isError) {
    return (
      <div className="space-y-2">
        <ErrorBanner message="Materials could not be loaded." />
        <Button size="sm" variant="outline" onClick={() => materialsQuery.refetch()}>Retry</Button>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <SummaryBlock tone="warning">
        No materials are configured. Add a material in Configuration before confirming this requirement.{" "}
        <Link href="/steel/config/materials" className="underline font-medium">Go to Configuration →</Link>
      </SummaryBlock>
    );
  }

  const needsClassification = !!selectedMaterial && !selectedMaterial.materialType;
  const canConfirm = !!selectedMaterial && !!selectedMaterial.materialType;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Material (from Material Master)</label>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          value={effectiveMaterialId}
          onChange={(e) => setMaterialId(e.target.value)}
        >
          <option value="">Select a configured material...</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
          ))}
        </select>
      </div>

      {selectedMaterial && (
        <DocGrid cols={3}>
          <DocField label="Code" value={selectedMaterial.code} />
          <DocField label="Category" value={selectedMaterial.category} />
          <DocField label="Material Type" value={selectedMaterial.materialType?.replace(/_/g, " ") ?? "—"} />
          <DocField label="UOM" value={selectedMaterial.unit} />
          <DocField label="Specification" value={selectedMaterial.specificationReference} />
          <DocField label="Procurement Type" value={selectedMaterial.procurementType} />
        </DocGrid>
      )}

      {needsClassification && (
        <SummaryBlock tone="warning">
          &quot;{selectedMaterial!.name}&quot; has no Material Type set in Configuration.{" "}
          <Link href="/steel/config/materials" className="underline font-medium">Classify it in Configuration</Link> before it can be confirmed here.
        </SummaryBlock>
      )}

      {canConfirm && (
        <SummaryBlock tone="success">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Selected: {selectedMaterial!.code} — {selectedMaterial!.name}. Ready to confirm.
          </span>
        </SummaryBlock>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Notes (optional)</label>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any context on the material requirement" />
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={!canConfirm || mutation.isPending} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to Supplier Assessment →"}
        </Button>
      </div>
    </form>
  );
}

function MaterialClassificationSummary({ order, material }: { order: SteelSourcingOrder; material: ConfigMaterial | undefined }) {
  return (
    <DocGrid cols={3}>
      <DocField label="Material" value={material ? `${material.code} — ${material.name}` : null} />
      <DocField label="Material Type" value={order.materialType?.replace(/_/g, " ")} />
      <DocField label="Category" value={material?.category} />
      <DocField label="UOM" value={material?.unit} />
      <DocField label="Specification" value={material?.specificationReference} />
      <DocField label="Notes" value={decodeUserNotes(order.materialTypeNotes)} />
    </DocGrid>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S1Requirement({
  order, token, onRefresh,
}: { order: SteelSourcingOrder; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();
  const materialsQuery = useQuery({
    queryKey: ["steel-config-materials", "active"],
    queryFn: () => SteelConfigService.listMaterials(accessToken!),
    enabled: !!accessToken && order.stage !== "A01_REQUIREMENT_REVIEWED",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-sourcing-order", order.id] });
    onRefresh();
  };

  const a02Done = order.stage !== "A01_REQUIREMENT_REVIEWED";
  const confirmedCode = decodeMaterialCode(order.materialTypeNotes);
  // Prefer the exact confirmed record (persisted via its code — see the note
  // on MATERIAL_NOTE_PREFIX above); fall back to a materialType match only for
  // orders confirmed before this encoding existed.
  const matchedMaterial =
    (confirmedCode && materialsQuery.data?.find((m) => m.code === confirmedCode)) ||
    materialsQuery.data?.find((m) => m.materialType === order.materialType);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <ScreenHeader
        icon={ClipboardList}
        title="Requirement"
        subtitle="Review the production requirement and classify the material needed, using P01 and the Material Master."
        backHref="/steel/p02"
        backLabel="Back to Sourcing Orders"
        code="P02"
      />
      <WorkflowIndicator
        steps={SCREENS}
        doneCount={0}
        activeIndex={a02Done ? null : 0}
        activeColorBar={STEEL_PROCESSES.find((p) => p.code === "P02")!.color.bar}
      />

      <P02Layout
        info={
          <P02InfoCard
            alreadyProvided="Plan, product, grade, size, quantity, and required date, from the released production plan (P01)."
            whatToEnter="The Material Master record this requirement maps to, if not already unambiguous."
            beforeYouContinue={["Correct material selected.", "Specification is appropriate."]}
          />
        }
      >
        <div className="rounded-lg border border-input bg-background shadow-sm p-4 md:p-6 space-y-5">
          <DocSection number="01" title="Production Requirement" status="done" first>
            <ProductionRequirement order={order} />
          </DocSection>

          <DocSection number="02" title="Material Classification" status={a02Done ? "done" : "active"}>
            {a02Done ? (
              <MaterialClassificationSummary order={order} material={matchedMaterial} />
            ) : (
              <MaterialClassificationForm id={order.id} token={token} onDone={refresh} />
            )}
          </DocSection>

        </div>
      </P02Layout>
    </div>
  );
}
