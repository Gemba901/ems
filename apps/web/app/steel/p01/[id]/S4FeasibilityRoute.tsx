"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast.context";
import {
  SteelService,
  SteelProductionPlan,
  PlantRoute,
  AvailabilityStatus,
  SelectRoutePayload,
  MaterialCheckPayload,
  CapacityCheckPayload,
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
  Route as RouteIcon,
  Factory,
  Flame,
  RotateCw,
  Box,
  ShoppingCart,
  Ship,
  Thermometer,
  Snowflake,
  Shuffle,
  Check,
  Circle,
  Info,
  ListChecks,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Wrench,
  Users,
  PackageCheck,
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

function ContextSummary({ plan }: { plan: SteelProductionPlan }) {
  const qty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan Context</CardTitle>
        <p className="text-sm text-slate-500">From S1–S3 — read only.</p>
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
            <p className="text-xs text-slate-400">Grade / Size</p>
            <p className="font-medium text-slate-800">{[plan.grade, plan.size].filter(Boolean).join(" / ") || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Quantity</p>
            <p className="font-medium text-slate-800">{qty} t</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Priority</p>
            <p className="font-medium text-slate-800">{plan.priority?.replace(/_/g, " ") ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Stock Decision</p>
            <p className="font-medium text-slate-800">{plan.stockDecision?.replace(/_/g, " ") ?? "—"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Readiness checklist ──────────────────────────────────────────────────────

type ReadinessState = "done" | "active" | "pending";

function ReadinessRow({
  state, label, value,
}: { state: ReadinessState; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2.5">
        {state === "done" ? (
          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : state === "active" ? (
          <Circle className="h-4 w-4 text-blue-500 fill-blue-100 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-slate-300 shrink-0" />
        )}
        <span className={"text-sm font-medium " + (state === "pending" ? "text-slate-400" : "text-slate-800")}>{label}</span>
      </div>
      <span className={"text-xs " + (state === "pending" ? "text-slate-300" : "text-slate-500")}>{value}</span>
    </div>
  );
}

function ReadinessChecklist({ plan }: { plan: SteelProductionPlan }) {
  const routeState: ReadinessState = plan.plantRoute ? "done" : "active";
  const materialState: ReadinessState = plan.materialAvailability
    ? "done"
    : plan.plantRoute
      ? "active"
      : "pending";
  const capacityState: ReadinessState =
    plan.equipmentAvailability && plan.manpowerAvailability
      ? "done"
      : plan.materialAvailability
        ? "active"
        : "pending";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Readiness Checklist</CardTitle>
        <p className="text-sm text-slate-500">Route → Material → Capacity → feasible for planning.</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          <ReadinessRow
            state={routeState}
            label="Route Selected"
            value={plan.plantRoute ? plan.plantRoute.replace(/_/g, " ") : "—"}
          />
          <ReadinessRow
            state={materialState}
            label="Material Readiness"
            value={plan.materialAvailability ? plan.materialAvailability.replace(/_/g, " ") : "—"}
          />
          <ReadinessRow
            state={capacityState}
            label="Operational Capacity"
            value={
              plan.equipmentAvailability && plan.manpowerAvailability
                ? `Equipment: ${plan.equipmentAvailability.replace(/_/g, " ")} · Manpower: ${plan.manpowerAvailability.replace(/_/g, " ")}`
                : "Equipment: — · Manpower: —"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Sidebar({ plan, subStep }: { plan: SteelProductionPlan; subStep: "A07" | "A08" | "A09" | "done" }) {
  const qty = plan.totalQuantity ?? plan.requestedQuantityTonnes;
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
            S4 answers one question: can this production requirement actually be executed? It covers P01-A07
            (route), P01-A08 (material readiness) and P01-A09 (equipment/manpower capacity).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Context</CardTitle>
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
              <dt className="text-slate-400">Stock Decision</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.stockDecision?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Route</dt>
              <dd className="text-slate-700 font-medium text-right">{plan.plantRoute?.replace(/_/g, " ") ?? "—"}</dd>
            </div>
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
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-purple-600" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            {subStep === "done"
              ? "S5 — Plan Preparation & Communication."
              : "Complete the readiness checklist to move on to S5 — Plan Preparation & Communication."}
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
            {subStep === "A07" && <li>Choose the route that will actually be used to produce this plan.</li>}
            {subStep === "A08" && <li>Note any shortage or purchase requirement so procurement can act on it.</li>}
            {subStep === "A09" && <li>Equipment and manpower are checked together as overall capacity.</li>}
            {subStep === "done" && <li>All three readiness checks are recorded and visible in the summary above.</li>}
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── A07 — Plant route ─────────────────────────────────────────────────────────

const PLANT_ROUTES: { value: PlantRoute; label: string; description: string; icon: typeof Factory }[] = [
  { value: "INTEGRATED_PLANT", label: "Integrated Plant", description: "Fully integrated production facility.", icon: Factory },
  { value: "SCRAP_BASED_FURNACE_PLANT", label: "Scrap-Based Furnace Plant", description: "Furnace route using scrap feedstock.", icon: Flame },
  { value: "RE_ROLLER_PLANT", label: "Re-Roller Plant", description: "Re-rolling of existing billets/stock.", icon: RotateCw },
  { value: "OWN_CCM_BILLET_ROUTE", label: "Own CCM Billet Route", description: "Billets from own continuous casting machine.", icon: Box },
  { value: "LOCAL_PURCHASED_BILLET_ROUTE", label: "Local Purchased Billet Route", description: "Billets purchased locally.", icon: ShoppingCart },
  { value: "IMPORTED_BILLET_ROUTE", label: "Imported Billet Route", description: "Billets sourced via import.", icon: Ship },
  { value: "HOT_CHARGE_ROUTE", label: "Hot Charge Route", description: "Hot-charged material into the furnace.", icon: Thermometer },
  { value: "COLD_CHARGE_ROUTE", label: "Cold Charge Route", description: "Cold-charged material into the furnace.", icon: Snowflake },
  { value: "MULTIPLE_ROUTES", label: "Multiple Routes", description: "A combination of more than one route.", icon: Shuffle },
];

function RouteForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [route, setRoute] = useState<PlantRoute | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: SelectRoutePayload) => SteelService.selectRoute(planId, payload, token),
    onSuccess: () => {
      toast("Route confirmed — check material readiness next.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!route) {
      setError("Please select a plant route.");
      return;
    }
    mutation.mutate({ plantRoute: route, routeNotes: notes || undefined });
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
          <CardTitle>Plant Route</CardTitle>
          <p className="text-sm text-slate-500">Which route will produce this plan? (required)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {PLANT_ROUTES.map((r) => {
              const Icon = r.icon;
              const selected = r.value === route;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRoute(r.value)}
                  aria-pressed={selected}
                  className={
                    "relative flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (selected
                      ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm")
                  }
                >
                  {selected && (
                    <div className="absolute top-2 right-2 h-4.5 w-4.5 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div
                    className={
                      "h-9 w-9 rounded-lg flex items-center justify-center " +
                      (selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
                    }
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-500 leading-snug">{r.description}</p>
                  </div>
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
            Route notes <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for this route choice" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Route →"}
        </Button>
      </div>
    </form>
  );
}

// ── A08 — Material readiness ─────────────────────────────────────────────────

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string; tone: string }[] = [
  { value: "AVAILABLE", label: "Available", tone: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { value: "PARTIAL", label: "Partial", tone: "border-amber-300 bg-amber-50 text-amber-700" },
  { value: "NOT_AVAILABLE", label: "Not Available", tone: "border-red-300 bg-red-50 text-red-700" },
];

function MaterialForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [availability, setAvailability] = useState<AvailabilityStatus | "">("");
  const [shortageNotes, setShortageNotes] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: MaterialCheckPayload) => SteelService.checkMaterial(planId, payload, token),
    onSuccess: () => {
      toast("Material readiness recorded — check capacity next.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!availability) {
      setError("Please select the raw material / billet availability status.");
      return;
    }
    mutation.mutate({
      materialAvailability: availability,
      materialShortageNotes: shortageNotes || undefined,
      purchaseRequirementNotes: purchaseNotes || undefined,
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
          <CardTitle>Raw Material / Billet Availability</CardTitle>
          <p className="text-sm text-slate-500">Is the required material on hand? (required)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AVAILABILITY_OPTIONS.map((o) => {
              const selected = o.value === availability;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setAvailability(o.value)}
                  aria-pressed={selected}
                  className={
                    "relative flex items-center gap-2 rounded-xl border-2 px-4 py-4 text-left font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (selected ? o.tone : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")
                  }
                >
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                  <span className="text-sm">{o.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {(availability === "PARTIAL" || availability === "NOT_AVAILABLE") && (
        <Card>
          <CardHeader>
            <CardTitle>Shortage Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Shortage notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input value={shortageNotes} onChange={(e) => setShortageNotes(e.target.value)} placeholder="What's short and by how much" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">
                  Purchase requirement <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <Input value={purchaseNotes} onChange={(e) => setPurchaseNotes(e.target.value)} placeholder="What needs to be purchased" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Material Readiness →"}
        </Button>
      </div>
    </form>
  );
}

// ── A09 — Operational capacity ───────────────────────────────────────────────

function CapacityForm({ planId, token, onDone }: { planId: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [equipment, setEquipment] = useState<AvailabilityStatus | "">("");
  const [manpower, setManpower] = useState<AvailabilityStatus | "">("");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: CapacityCheckPayload) => SteelService.checkCapacity(planId, payload, token),
    onSuccess: () => {
      toast("Capacity readiness recorded.", "success");
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!equipment || !manpower) {
      setError("Please select both equipment and manpower availability.");
      return;
    }
    mutation.mutate({
      equipmentAvailability: equipment,
      manpowerAvailability: manpower,
      maintenanceShutdownNotes: maintenanceNotes || undefined,
      shiftPlanNotes: shiftNotes || undefined,
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
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-500" />
            Equipment
          </CardTitle>
          <p className="text-sm text-slate-500">Is the equipment available and free of maintenance conflicts? (required)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AVAILABILITY_OPTIONS.map((o) => {
              const selected = o.value === equipment;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setEquipment(o.value)}
                  aria-pressed={selected}
                  className={
                    "relative flex items-center gap-2 rounded-xl border-2 px-4 py-4 text-left font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (selected ? o.tone : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")
                  }
                >
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                  <span className="text-sm">{o.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Maintenance / shutdown notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input value={maintenanceNotes} onChange={(e) => setMaintenanceNotes(e.target.value)} placeholder="Optional" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            Manpower
          </CardTitle>
          <p className="text-sm text-slate-500">Is sufficient manpower available? (required)</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {AVAILABILITY_OPTIONS.map((o) => {
              const selected = o.value === manpower;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setManpower(o.value)}
                  aria-pressed={selected}
                  className={
                    "relative flex items-center gap-2 rounded-xl border-2 px-4 py-4 text-left font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                    (selected ? o.tone : "border-slate-200 bg-white text-slate-700 hover:border-slate-300")
                  }
                >
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                  <span className="text-sm">{o.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Shift plan notes <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)} placeholder="Optional" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Capacity Readiness →"}
        </Button>
      </div>
    </form>
  );
}

// ── Completion ────────────────────────────────────────────────────────────────

function S4CompleteCard({ plan, onContinue }: { plan: SteelProductionPlan; onContinue: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-700">
          <PackageCheck className="h-4 w-4" />
          S4 Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Route</p>
            <p className="font-medium text-slate-800">{plan.plantRoute?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Material</p>
            <p className="font-medium text-slate-800">{plan.materialAvailability?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Equipment</p>
            <p className="font-medium text-slate-800">{plan.equipmentAvailability?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Manpower</p>
            <p className="font-medium text-slate-800">{plan.manpowerAvailability?.replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
          Next: <span className="font-medium text-slate-700">S5 — Plan Preparation & Communication</span>
        </div>
        <Button onClick={onContinue} className="gap-2">
          Continue to S5 — Plan Preparation <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S4FeasibilityRoute({
  plan, token, onRefresh,
}: { plan: SteelProductionPlan; token: string; onRefresh: () => void }) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["steel-plan", plan.id] });
    onRefresh();
  };

  let subStep: "A07" | "A08" | "A09" | "done" = "A07";
  let body: React.ReactNode;

  if (plan.stage === "A06_STOCK_DECISION_MADE") {
    subStep = "A07";
    body = <RouteForm planId={plan.id} token={token} onDone={refresh} />;
  } else if (plan.stage === "A07_ROUTE_SELECTED") {
    subStep = "A08";
    body = <MaterialForm planId={plan.id} token={token} onDone={refresh} />;
  } else if (plan.stage === "A08_MATERIAL_CHECKED") {
    subStep = "A09";
    body = <CapacityForm planId={plan.id} token={token} onDone={refresh} />;
  } else {
    // stage === A09_CAPACITY_CHECKED — just completed or resumed after refresh
    subStep = "done";
    body = <S4CompleteCard plan={plan} onContinue={refresh} />;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <ScreenHeader
        icon={RouteIcon}
        title="Feasibility & Route Planning"
        subtitle={`${plan.planNumber} — confirm the production route, material readiness and operational capacity.`}
        rightContent={<StatusBadge status={plan.status} />}
      />
      <WorkflowIndicator doneCount={3} activeIndex={3} />
      <ContextSummary plan={plan} />
      <ReadinessChecklist plan={plan} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4">
          {subStep === "A07" && <CurrentTaskBanner text="Select the plant route that will produce this plan." />}
          {subStep === "A08" && <CurrentTaskBanner text="Confirm whether the required raw material / billets are available." />}
          {subStep === "A09" && <CurrentTaskBanner text="Confirm equipment and manpower availability for this plan." />}
          {body}
        </div>
        <Sidebar plan={plan} subStep={subStep} />
      </div>
    </div>
  );
}
