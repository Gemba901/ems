"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  SteelProductionPlan,
  DemandSource,
  OrderPriority,
  AvailabilityStatus,
  StockDecision,
  SteelPlanStage,
} from "@/services/steel.service";
import { SteelMasterDataService } from "@/services/steel-master-data.service";
import { MasterDataCombobox, ComboboxOption } from "@/components/steel/p01/MasterDataCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { Loader2, ClipboardList, AlertTriangle } from "lucide-react";

// The full backend stage sequence — used only to figure out which A01-A11
// activities still need to run for a given plan, never to drive screens.
const STAGE_ORDER: SteelPlanStage[] = [
  "A01_DEMAND_CAPTURED",
  "A02_PRIORITY_CONFIRMED",
  "A03_PRODUCT_CONFIRMED",
  "A04_SPEC_CONFIRMED",
  "A05_STOCK_CHECKED",
  "A06_STOCK_DECISION_MADE",
  "A07_ROUTE_SELECTED",
  "A08_MATERIAL_CHECKED",
  "A09_CAPACITY_CHECKED",
  "A10_PLAN_DRAFTED",
  "A11_PLAN_COMMUNICATED",
  "A12_PLAN_RELEASED",
];

const DEMAND_SOURCES: { value: DemandSource; label: string }[] = [
  { value: "CUSTOMER_ORDER", label: "Customer Order" },
  { value: "DEALER_REQUIREMENT", label: "Dealer Order" },
  { value: "PROJECT_REQUIREMENT", label: "Project" },
  { value: "FORECAST", label: "Forecast" },
  { value: "INTERNAL_STOCK_PLAN", label: "Internal Stock Plan" },
];

const PRIORITY_OPTIONS: { value: OrderPriority; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "URGENT", label: "Urgent" },
  { value: "EXPORT", label: "Export" },
  { value: "PROJECT", label: "Project" },
  { value: "STOCK_REPLENISHMENT", label: "Stock Replenishment" },
];

// Mirrors the server-side default in steel.service.ts confirmPriority.
const DEFAULT_PRIORITY_BY_SOURCE: Record<DemandSource, OrderPriority> = {
  CUSTOMER_ORDER: "NORMAL",
  DEALER_REQUIREMENT: "NORMAL",
  PROJECT_REQUIREMENT: "PROJECT",
  FORECAST: "NORMAL",
  INTERNAL_STOCK_PLAN: "STOCK_REPLENISHMENT",
};

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: "AVAILABLE", label: "Available" },
  { value: "PARTIAL", label: "Partial" },
  { value: "NOT_AVAILABLE", label: "Not Available" },
];

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-semibold text-slate-700 block mb-1.5">
      {children}
      {required && <span className="text-red-500">*</span>}
    </label>
  );
}

function Select({
  value, onChange, options, className,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select
      className={"h-10 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all " + (className ?? "")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-sm font-semibold text-blue-600 pb-2 border-b border-blue-100">{title}</h2>
      {children}
    </section>
  );
}

function DerivedRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-lg border border-indigo-200/70 bg-indigo-50/60 px-3 py-2">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-indigo-500/90">{label}</span>
      <span className="block text-sm font-medium text-slate-700">{value}</span>
      <span className="block text-[10px] mt-0.5 text-indigo-500/90">Read-only · Configuration</span>
    </div>
  );
}

// Reference field is a single input whose target backend column depends on
// demandSource — the planner only ever sees one reference field, never four.
const REFERENCE_FIELD_BY_SOURCE: Record<
  DemandSource,
  { key: "salesOrderNumber" | "projectReference" | "forecastReference" | "stockRequirementReference"; label: string } | null
> = {
  CUSTOMER_ORDER: { key: "salesOrderNumber", label: "Order Reference" },
  DEALER_REQUIREMENT: { key: "salesOrderNumber", label: "Order Reference" },
  PROJECT_REQUIREMENT: { key: "projectReference", label: "Project Reference" },
  FORECAST: { key: "forecastReference", label: "Forecast Reference" },
  INTERNAL_STOCK_PLAN: { key: "stockRequirementReference", label: "Stock Requirement Reference" },
};

function PlanForm({ plan, token }: { plan: SteelProductionPlan | null; token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Demand ──
  const [demandSource, setDemandSource] = useState<DemandSource>(plan?.demandSource ?? "CUSTOMER_ORDER");
  const [customer, setCustomer] = useState<ComboboxOption | null>(
    plan?.customerId ? { value: plan.customerId, label: plan.customerName ?? plan.dealerName ?? "" } : null,
  );
  const referenceField = REFERENCE_FIELD_BY_SOURCE[demandSource];
  const [reference, setReference] = useState(
    plan?.salesOrderNumber ?? plan?.projectReference ?? plan?.forecastReference ?? plan?.stockRequirementReference ?? "",
  );
  const [requiredDate, setRequiredDate] = useState(plan?.expectedDeliveryDate?.slice(0, 10) ?? "");
  const defaultPriority = DEFAULT_PRIORITY_BY_SOURCE[demandSource];
  const [priority, setPriority] = useState<OrderPriority>(plan?.priority ?? defaultPriority);
  const [priorityOverrideNote, setPriorityOverrideNote] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState(String(plan?.requestedQuantityTonnes ?? ""));

  // ── Product requirement ──
  const [product, setProduct] = useState<ComboboxOption | null>(
    plan?.productId ? { value: plan.productId, label: plan.productType ?? "" } : null,
  );
  const [spec, setSpec] = useState<ComboboxOption | null>(
    plan?.productSpecificationId ? { value: plan.productSpecificationId, label: [plan.grade, plan.size].filter(Boolean).join(" / ") } : null,
  );
  const [specDisplay, setSpecDisplay] = useState<{ grade: string; size: string; standard: string; length: string | null; toleranceNotes: string | null } | null>(
    plan?.grade
      ? { grade: plan.grade, size: plan.size ?? "", standard: plan.productStandard ?? "", length: plan.length, toleranceNotes: plan.toleranceNotes }
      : null,
  );

  // ── Fulfilment (calculated) ──
  const requiredQty = Number(requestedQuantity) || 0;
  const { data: fgStock } = useQuery({
    queryKey: ["master-fg-stock", spec?.value],
    queryFn: () => SteelMasterDataService.getFinishedGoodsStock(spec!.value, token),
    enabled: !!spec,
  });
  const certifiedQty = fgStock?.certifiedQtyTonnes ?? plan?.certifiedStockAvailableQty ?? null;
  const shortfall = certifiedQty !== null ? requiredQty - certifiedQty : null;
  const suggestedDecision: StockDecision = shortfall !== null && shortfall <= 0 ? "DISPATCH_FROM_STOCK" : "PRODUCTION_REQUIRED";
  const [decision, setDecision] = useState<StockDecision>(plan?.stockDecision ?? suggestedDecision);
  const [decisionOverrideNote, setDecisionOverrideNote] = useState("");

  // ── Production ──
  const [route, setRoute] = useState<ComboboxOption | null>(
    plan?.productionRouteId ? { value: plan.productionRouteId, label: plan.plantRoute ?? "" } : null,
  );
  const { data: routeSteps } = useQuery({
    queryKey: ["master-route-steps", route?.value],
    queryFn: () => SteelMasterDataService.getRouteSteps(route!.value, token),
    enabled: !!route,
  });
  const [materialAvailability, setMaterialAvailability] = useState<AvailabilityStatus>(plan?.materialAvailability ?? "AVAILABLE");
  const [equipmentAvailability, setEquipmentAvailability] = useState<AvailabilityStatus>(plan?.equipmentAvailability ?? "AVAILABLE");
  const [manpowerAvailability, setManpowerAvailability] = useState<AvailabilityStatus>(plan?.manpowerAvailability ?? "AVAILABLE");

  const [saving, setSaving] = useState<"draft" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageAtLeast = (current: SteelPlanStage | undefined, target: SteelPlanStage) =>
    !!current && STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(target);

  const handleSaveDraft = async () => {
    setError(null);
    const qty = Number(requestedQuantity);
    if (!qty || qty <= 0) {
      setError("Enter a requested quantity to save a draft.");
      return;
    }
    setSaving("draft");
    try {
      if (plan) {
        toast("Draft already saved.", "success");
      } else {
        await SteelService.create(
          {
            demandSource,
            // Dealer is a distinct Configuration model from Customer — the
            // selected dealer's id has no meaning as a Customer.customerId,
            // so a dealer selection is passed through as dealerName (the
            // existing free-text column) rather than customerId.
            customerId: demandSource === "DEALER_REQUIREMENT" ? undefined : customer?.value,
            customerName: demandSource === "DEALER_REQUIREMENT" ? undefined : customer?.label,
            dealerName: demandSource === "DEALER_REQUIREMENT" ? customer?.label : undefined,
            salesOrderNumber: referenceField?.key === "salesOrderNumber" ? reference || undefined : undefined,
            projectReference: referenceField?.key === "projectReference" ? reference || undefined : undefined,
            forecastReference: referenceField?.key === "forecastReference" ? reference || undefined : undefined,
            stockRequirementReference: referenceField?.key === "stockRequirementReference" ? reference || undefined : undefined,
            expectedDeliveryDate: requiredDate || undefined,
            requestedQuantityTonnes: qty,
          },
          token,
        );
        toast("Draft saved.", "success");
      }
      router.push("/steel/p01");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save draft.");
    } finally {
      setSaving(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = Number(requestedQuantity);
    if (!qty || qty <= 0) {
      setError("Requested quantity must be greater than zero.");
      return;
    }
    if (demandSource === "CUSTOMER_ORDER" && !customer) {
      setError("Select a customer for a customer order. Not listed? Ask a Steel Administrator to add it.");
      return;
    }
    if (demandSource === "DEALER_REQUIREMENT" && !customer) {
      setError("Select a dealer for a dealer order. Not listed? Ask a Steel Administrator to add it.");
      return;
    }
    if (!product) {
      setError("Select a product. Not listed? Ask a Steel Administrator to add it under Steel Configuration.");
      return;
    }
    if (!spec) {
      setError("Select a product specification. Not listed? Ask a Steel Administrator to add it under Steel Configuration.");
      return;
    }
    if (decision !== suggestedDecision && !decisionOverrideNote.trim()) {
      setError(`Overriding the suggested fulfilment decision (${suggestedDecision.replace(/_/g, " ")}) requires a note.`);
      return;
    }
    if (priority !== defaultPriority && !priorityOverrideNote.trim()) {
      setError(`Overriding the suggested priority (${defaultPriority.replace(/_/g, " ")}) requires a note.`);
      return;
    }
    if (!route) {
      setError("Select a production route. Not listed? Ask a Steel Administrator to add it under Steel Configuration.");
      return;
    }

    setSaving("create");
    try {
      // Resume-safe: each step is skipped if the plan has already passed it,
      // so re-submitting after a partial failure (or resuming a saved draft)
      // continues from wherever it left off instead of erroring on
      // already-completed activities.
      let current =
        plan ??
        (await SteelService.create(
          {
            demandSource,
            // Dealer is a distinct Configuration model from Customer — the
            // selected dealer's id has no meaning as a Customer.customerId,
            // so a dealer selection is passed through as dealerName (the
            // existing free-text column) rather than customerId.
            customerId: demandSource === "DEALER_REQUIREMENT" ? undefined : customer?.value,
            customerName: demandSource === "DEALER_REQUIREMENT" ? undefined : customer?.label,
            dealerName: demandSource === "DEALER_REQUIREMENT" ? customer?.label : undefined,
            salesOrderNumber: referenceField?.key === "salesOrderNumber" ? reference || undefined : undefined,
            projectReference: referenceField?.key === "projectReference" ? reference || undefined : undefined,
            forecastReference: referenceField?.key === "forecastReference" ? reference || undefined : undefined,
            stockRequirementReference: referenceField?.key === "stockRequirementReference" ? reference || undefined : undefined,
            expectedDeliveryDate: requiredDate || undefined,
            requestedQuantityTonnes: qty,
          },
          token,
        ));

      if (!stageAtLeast(current.stage, "A02_PRIORITY_CONFIRMED")) {
        current = await SteelService.confirmPriority(current.id, { priority, notes: priorityOverrideNote || undefined }, token);
      }
      if (!stageAtLeast(current.stage, "A03_PRODUCT_CONFIRMED")) {
        current = await SteelService.confirmProduct(current.id, { productId: product!.value }, token);
      }
      if (!stageAtLeast(current.stage, "A04_SPEC_CONFIRMED")) {
        current = await SteelService.confirmSpecification(
          current.id,
          { productSpecificationId: spec!.value, totalQuantity: qty },
          token,
        );
      }
      if (!stageAtLeast(current.stage, "A05_STOCK_CHECKED")) {
        current = await SteelService.checkStock(current.id, {}, token);
      }
      if (!stageAtLeast(current.stage, "A06_STOCK_DECISION_MADE")) {
        current = await SteelService.decideStockOrProduction(
          current.id,
          { stockDecision: decision, stockDecisionNotes: decisionOverrideNote || undefined },
          token,
        );
      }
      if (!stageAtLeast(current.stage, "A07_ROUTE_SELECTED")) {
        current = await SteelService.selectRoute(current.id, { productionRouteId: route!.value }, token);
      }
      if (!stageAtLeast(current.stage, "A08_MATERIAL_CHECKED")) {
        current = await SteelService.checkMaterial(current.id, { materialAvailability }, token);
      }
      if (!stageAtLeast(current.stage, "A09_CAPACITY_CHECKED")) {
        current = await SteelService.checkCapacity(current.id, { equipmentAvailability, manpowerAvailability }, token);
      }
      if (!stageAtLeast(current.stage, "A10_PLAN_DRAFTED")) {
        current = await SteelService.prepareProductionPlan(
          current.id,
          {
            productionSequence: [{ batch: "1", quantityTonnes: qty, sequenceDate: requiredDate || undefined }],
            plannedStartDate: requiredDate || undefined,
            plannedEndDate: requiredDate || undefined,
          },
          token,
        );
      }
      if (!stageAtLeast(current.stage, "A11_PLAN_COMMUNICATED")) {
        current = await SteelService.communicatePlan(current.id, {}, token);
      }

      toast("Planning document created.", "success");
      queryClient.invalidateQueries({ queryKey: ["steel-plan", current.id] });
      router.push(`/steel/p01/${current.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the planning document.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-5">
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

      {/* Demand */}
      <Section title="Demand">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label required>Demand Source</Label>
            <Select
              value={demandSource}
              onChange={(v) => setDemandSource(v as DemandSource)}
              options={DEMAND_SOURCES}
            />
          </div>

          {(demandSource === "CUSTOMER_ORDER" || demandSource === "DEALER_REQUIREMENT" || demandSource === "PROJECT_REQUIREMENT") && (
            <div>
              <Label required={demandSource !== "PROJECT_REQUIREMENT"}>
                {demandSource === "DEALER_REQUIREMENT" ? "Dealer" : "Customer"}
              </Label>
              <MasterDataCombobox
                value={customer}
                onChange={setCustomer}
                queryKey={[demandSource === "DEALER_REQUIREMENT" ? "master-dealers" : "master-customers"]}
                fetchOptions={async (q) => {
                  if (demandSource === "DEALER_REQUIREMENT") {
                    const dealers = await SteelMasterDataService.getDealers(token, q);
                    return dealers.map((d) => ({ value: d.id, label: d.name, description: d.region ?? undefined }));
                  }
                  const customers = await SteelMasterDataService.getCustomers(token, q);
                  return customers.map((c) => ({ value: c.id, label: c.name }));
                }}
                placeholder={demandSource === "DEALER_REQUIREMENT" ? "Search dealers..." : "Search customers..."}
              />
              {!customer && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Not listed? Ask a Steel Administrator to add it under Steel Configuration.
                </p>
              )}
            </div>
          )}

          {referenceField && (
            <div>
              <Label>{referenceField.label}</Label>
              <Input className="h-8" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          )}

          <div>
            <Label>Required Date</Label>
            <Input className="h-8" type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={priority} onChange={(v) => setPriority(v as OrderPriority)} options={PRIORITY_OPTIONS} />
            <p className="text-xs text-muted-foreground mt-1">Suggested: {defaultPriority.replace(/_/g, " ")}</p>
          </div>
          {priority !== defaultPriority && (
            <div>
              <Label required>Reason for priority override</Label>
              <Input className="h-8" value={priorityOverrideNote} onChange={(e) => setPriorityOverrideNote(e.target.value)} placeholder="Why does this differ from the suggestion?" />
            </div>
          )}
        </div>
      </Section>

      {/* Product requirement */}
      <Section title="Product Requirement">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label required>Product</Label>
            <MasterDataCombobox
              value={product}
              onChange={(opt) => {
                setProduct(opt);
                setSpec(null);
                setSpecDisplay(null);
              }}
              queryKey={["master-products"]}
              fetchOptions={async (q) => {
                const products = await SteelMasterDataService.getProducts(token, { q });
                return products.map((p) => ({ value: p.id, label: p.name, description: p.productType.replace(/_/g, " ") }));
              }}
              placeholder="Search products..."
            />
            {!product && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Not listed? Ask a Steel Administrator to add it under Steel Configuration.
              </p>
            )}
          </div>

          <div>
            <Label required>Product Specification</Label>
            <MasterDataCombobox
              value={spec}
              onChange={async (opt) => {
                setSpec(opt);
                const specs = await SteelMasterDataService.getProductSpecifications(token, { productId: product?.value });
                const found = specs.find((s) => s.id === opt.value);
                if (found) setSpecDisplay({ grade: found.grade, size: found.size, standard: found.standard, length: found.length, toleranceNotes: found.toleranceNotes });
              }}
              queryKey={["master-product-specifications", product?.value ?? ""]}
              fetchOptions={async (q) => {
                const specs = await SteelMasterDataService.getProductSpecifications(token, { q, productId: product?.value });
                return specs.map((s) => ({ value: s.id, label: s.displayLabel }));
              }}
              placeholder="Search specifications..."
            />
            {!spec && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Not listed? Ask a Steel Administrator to add it under Steel Configuration.
              </p>
            )}
          </div>

          <div>
            <Label required>Requested Quantity</Label>
            <div className="relative">
              <Input
                className="h-8 pr-14"
                type="number"
                step="0.01"
                min="0.01"
                value={requestedQuantity}
                onChange={(e) => setRequestedQuantity(e.target.value)}
                placeholder="e.g. 120"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">tonnes</span>
            </div>
          </div>
        </div>

        {specDisplay && (
          <div className="rounded-md bg-muted/30 border border-input px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4">
            <DerivedRow label="Grade" value={specDisplay.grade} />
            <DerivedRow label="Size" value={specDisplay.size} />
            <DerivedRow label="Standard" value={specDisplay.standard} />
            <DerivedRow label="Length" value={specDisplay.length} />
          </div>
        )}
        </Section>

      {/* Fulfilment */}
      <Section title="Fulfilment">
        <div className="rounded-md bg-muted/30 border border-input px-3 py-2 grid grid-cols-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Requested</p>
            <p className="text-sm font-semibold">{requiredQty || "—"} t</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stock Available</p>
            <p className="text-sm font-semibold">{certifiedQty ?? "—"} t</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{shortfall !== null && shortfall > 0 ? "Shortfall" : "Surplus"}</p>
            <p className="text-sm font-semibold">{shortfall !== null ? Math.abs(shortfall) : "—"} t</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label>Fulfilment Decision</Label>
            <Select
              value={decision}
              onChange={(v) => setDecision(v as StockDecision)}
              options={[
                { value: "DISPATCH_FROM_STOCK", label: "Dispatch from Stock" },
                { value: "PRODUCTION_REQUIRED", label: "Production Required" },
              ]}
            />
            <p className="text-xs text-muted-foreground mt-1">Suggested: {suggestedDecision.replace(/_/g, " ")}</p>
          </div>
          {decision !== suggestedDecision && (
            <div>
              <Label required>Reason for override</Label>
              <Input className="h-8" value={decisionOverrideNote} onChange={(e) => setDecisionOverrideNote(e.target.value)} placeholder="Why does this differ from the suggestion?" />
            </div>
          )}
        </div>
      </Section>

      {/* Production */}
      <Section title="Production">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label required>Production Route</Label>
            <MasterDataCombobox
              value={route}
              onChange={setRoute}
              queryKey={["master-routes"]}
              fetchOptions={async (q) => {
                const routes = await SteelMasterDataService.getRoutes(token, q);
                return routes.map((r) => ({ value: r.id, label: r.name, description: r.plantRoute.replace(/_/g, " ") }));
              }}
              placeholder="Search production routes..."
            />
            {!route && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Not listed? Ask a Steel Administrator to add it under Steel Configuration.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <Label>Readiness</Label>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Material</p>
                <Select value={materialAvailability} onChange={(v) => setMaterialAvailability(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Equipment</p>
                <Select value={equipmentAvailability} onChange={(v) => setEquipmentAvailability(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Manpower</p>
                <Select value={manpowerAvailability} onChange={(v) => setManpowerAvailability(v as AvailabilityStatus)} options={AVAILABILITY_OPTIONS} />
              </div>
            </div>
          </div>
        </div>

        {route && routeSteps && routeSteps.length > 0 && (
          <div className="rounded-md bg-muted/30 border border-input px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">Departments</p>
            <p className="text-sm font-medium">
              {[...new Set(routeSteps.map((s) => s.department))].map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(" → ")}
            </p>
          </div>
        )}
        </Section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <Link href="/steel/p01">
          <Button type="button" variant="ghost" disabled={!!saving}>
            Cancel
          </Button>
        </Link>
        <Button
          type="button"
          variant="outline"
          disabled={!!saving}
          onClick={handleSaveDraft}
          className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950"
        >
          {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as Draft"}
        </Button>
        <Button type="submit" disabled={!!saving} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
          {saving === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Planning Document"}
        </Button>
      </div>
    </form>
  );
}

function NewPlanPageInner() {
  const searchParams = useSearchParams();
  const { accessToken } = useAuthStore();
  const planId = searchParams.get("plan");

  const planQuery = useQuery({
    queryKey: ["steel-plan-edit", planId],
    queryFn: () => SteelService.getById(planId!, accessToken!),
    enabled: !!accessToken && !!planId,
    retry: false,
  });

  let body: React.ReactNode;
  if (!planId) {
    body = <PlanForm plan={null} token={accessToken!} />;
  } else if (planQuery.isLoading) {
    body = (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (planQuery.isError || !planQuery.data) {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center px-4">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-muted-foreground">This planning document could not be loaded.</p>
      </div>
    );
  } else {
    body = <PlanForm key={planQuery.data.id} plan={planQuery.data} token={accessToken!} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader
        icon={ClipboardList}
        title="Create Production Planning Document"
        subtitle="Enter the production requirement. Available master data and planning information will be populated automatically."
        code="P01"
      />
      {body}
    </div>
  );
}

export default function NewSteelPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewPlanPageInner />
    </Suspense>
  );
}
