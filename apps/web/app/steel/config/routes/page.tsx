"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigRoute, ConfigRouteStep } from "@/services/steel-config.service";
import type { PlantRoute, SteelDepartment } from "@/services/steel-master-data.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Route, Plus, Loader2, Search, ChevronDown, ChevronUp, Trash2, ArrowUp, ArrowDown } from "lucide-react";

const PLANT_ROUTES: PlantRoute[] = [
  "INTEGRATED_PLANT", "SCRAP_BASED_FURNACE_PLANT", "RE_ROLLER_PLANT", "OWN_CCM_BILLET_ROUTE",
  "LOCAL_PURCHASED_BILLET_ROUTE", "IMPORTED_BILLET_ROUTE", "HOT_CHARGE_ROUTE", "COLD_CHARGE_ROUTE", "MULTIPLE_ROUTES",
];
const DEPARTMENTS: SteelDepartment[] = ["PROCUREMENT", "YARD", "FURNACE", "CCM", "ROLLING", "QUALITY", "MAINTENANCE", "STORES", "DISPATCH"];

function RouteForm({ onClose, editing }: { onClose: () => void; editing: ConfigRoute | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [plantRoute, setPlantRoute] = useState<PlantRoute>(editing?.plantRoute ?? "INTEGRATED_PLANT");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? SteelConfigService.updateRoute(editing.id, { name, plantRoute }, accessToken!)
        : SteelConfigService.createRoute({ name, code, plantRoute }, accessToken!),
    onSuccess: () => {
      toast(editing ? "Route updated." : "Route created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-routes"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Route" : "Add Production Route"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim() || (!editing && !code.trim())) {
          setError("Route name and code are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Route"}
      error={error}
    >
      <div>
        <FormLabel>Route Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TMT Route — Standard" />
      </div>
      <div>
        <FormLabel>Route Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. RT-TMT-STD" disabled={!!editing} />
      </div>
      <div>
        <FormLabel>Plant Route</FormLabel>
        <select className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm" value={plantRoute} onChange={(e) => setPlantRoute(e.target.value as PlantRoute)}>
          {PLANT_ROUTES.map((p) => (
            <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
    </AdminModal>
  );
}

function AddStepForm({ routeId, onClose }: { routeId: string; onClose: () => void }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processName, setProcessName] = useState("");
  const [department, setDepartment] = useState<SteelDepartment>("FURNACE");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => SteelConfigService.addRouteStep(routeId, { processName, department }, accessToken!),
    onSuccess: () => {
      toast("Step added.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-routes"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title="Add Step"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!processName.trim()) {
          setError("Process name is required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel="Add Step"
      error={error}
    >
      <div>
        <FormLabel>Process Name</FormLabel>
        <Input className="h-8" value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="e.g. Rolling" />
      </div>
      <div>
        <FormLabel>Department</FormLabel>
        <select className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm" value={department} onChange={(e) => setDepartment(e.target.value as SteelDepartment)}>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
    </AdminModal>
  );
}

function RouteRow({ route }: { route: ConfigRoute }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editingRoute, setEditingRoute] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

  const toggleActive = useMutation({
    mutationFn: () => SteelConfigService.updateRoute(route.id, { isActive: !route.isActive }, accessToken!),
    onSuccess: () => {
      toast("Route updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-routes"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: string) => SteelConfigService.deleteRouteStep(stepId, accessToken!),
    onSuccess: () => {
      toast("Step removed.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-routes"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const reorder = useMutation({
    mutationFn: (stepIdsInOrder: string[]) => SteelConfigService.reorderRouteSteps(route.id, stepIdsInOrder, accessToken!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config-routes"] }),
    onError: (err: Error) => toast(err.message, "error"),
  });

  const moveStep = (steps: ConfigRouteStep[], index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const ids = steps.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <>
      <tr className="border-b border-input/50">
        <td className="py-2 px-3 font-mono text-xs">{route.code}</td>
        <td className="py-2 px-3">{route.name}</td>
        <td className="py-2 px-3 text-muted-foreground">{route.plantRoute.replace(/_/g, " ")}</td>
        <td className="py-2 px-3 text-muted-foreground">{route.steps.length} steps</td>
        <td className="py-2 px-3">
          <Badge className={route.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
            {route.isActive ? "Active" : "Inactive"}
          </Badge>
        </td>
        <td className="py-2 px-3 text-right space-x-2">
          <Button size="xs" variant="outline" onClick={() => setExpanded((v) => !v)} className="gap-1">
            Steps {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button size="xs" variant="outline" onClick={() => setEditingRoute(true)}>Edit</Button>
          <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
            {route.isActive ? "Deactivate" : "Activate"}
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-input/50">
          <td colSpan={6} className="bg-muted/20 px-3 py-3">
            <div className="space-y-1.5">
              {route.steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2 text-sm bg-background border border-input rounded-md px-2.5 py-1.5">
                  <span className="text-xs text-muted-foreground w-5">{step.sequence}.</span>
                  <span className="flex-1">{step.processName}</span>
                  <span className="text-xs text-muted-foreground">{step.department.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveStep(route.steps, i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === route.steps.length - 1} onClick={() => moveStep(route.steps, i, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="text-red-500 hover:text-red-700" onClick={() => deleteStep.mutate(step.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <Button size="xs" variant="outline" className="gap-1 mt-1" onClick={() => setAddingStep(true)}>
                <Plus className="h-3 w-3" /> Add Step
              </Button>
            </div>
          </td>
        </tr>
      )}
      {editingRoute && <RouteForm editing={route} onClose={() => setEditingRoute(false)} />}
      {addingStep && <AddStepForm routeId={route.id} onClose={() => setAddingStep(false)} />}
    </>
  );
}

export default function RoutesConfigPage() {
  const { accessToken } = useAuthStore();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: routes, isLoading } = useQuery({
    queryKey: ["config-routes", q, includeInactive],
    queryFn: () => SteelConfigService.listRoutes(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <ScreenHeader icon={Route} title="Production Routes" subtitle="Ordered process steps and departments, used by P01 to derive the department list." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Route
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Plant Route</th>
              <th className="py-2 px-3 font-medium">Steps</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && routes?.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-xs">No routes found.</td></tr>
            )}
            {routes?.map((r) => <RouteRow key={r.id} route={r} />)}
          </tbody>
        </table>
      </div>

      {formOpen && <RouteForm editing={null} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
