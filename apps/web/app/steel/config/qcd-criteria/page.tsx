"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigQcdCriteria } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Scale, Plus, Loader2 } from "lucide-react";

// Configurable Quality/Cost/Delivery weighting used by P02-A06/S3 to compare
// supplier quotations — no scoring logic is hard-coded in the app, only the
// weights are, and those come from here.
function QcdForm({ onClose, editing }: { onClose: () => void; editing: ConfigQcdCriteria | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [qualityWeight, setQualityWeight] = useState(String(editing?.qualityWeight ?? 1));
  const [costWeight, setCostWeight] = useState(String(editing?.costWeight ?? 1));
  const [deliveryWeight, setDeliveryWeight] = useState(String(editing?.deliveryWeight ?? 1));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const data = { name, qualityWeight: Number(qualityWeight), costWeight: Number(costWeight), deliveryWeight: Number(deliveryWeight) };
      return editing
        ? SteelConfigService.updateQcdCriteria(editing.id, data, accessToken!)
        : SteelConfigService.createQcdCriteria(data, accessToken!);
    },
    onSuccess: () => {
      toast(editing ? "QCD criteria updated." : "QCD criteria created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-qcd-criteria"] });
      queryClient.invalidateQueries({ queryKey: ["steel-config-qcd-criteria"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit QCD Criteria" : "Add QCD Criteria"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) {
          setError("Name is required.");
          return;
        }
        if ([qualityWeight, costWeight, deliveryWeight].some((v) => Number(v) < 0 || Number.isNaN(Number(v)))) {
          setError("Weights must be non-negative numbers.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Criteria"}
      error={error}
    >
      <div>
        <FormLabel>Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard QCD" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <FormLabel>Quality Weight</FormLabel>
          <Input className="h-8" type="number" step="0.1" min="0" value={qualityWeight} onChange={(e) => setQualityWeight(e.target.value)} />
        </div>
        <div>
          <FormLabel>Cost Weight</FormLabel>
          <Input className="h-8" type="number" step="0.1" min="0" value={costWeight} onChange={(e) => setCostWeight(e.target.value)} />
        </div>
        <div>
          <FormLabel>Delivery Weight</FormLabel>
          <Input className="h-8" type="number" step="0.1" min="0" value={deliveryWeight} onChange={(e) => setDeliveryWeight(e.target.value)} />
        </div>
      </div>
    </AdminModal>
  );
}

export default function QcdCriteriaConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigQcdCriteria | null>(null);

  const { data: criteria, isLoading } = useQuery({
    queryKey: ["config-qcd-criteria", includeInactive],
    queryFn: () => SteelConfigService.listQcdCriteria(accessToken!, { includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (c: ConfigQcdCriteria) => SteelConfigService.updateQcdCriteria(c.id, { isActive: !c.isActive }, accessToken!),
    onSuccess: () => {
      toast("QCD criteria updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-qcd-criteria"] });
      queryClient.invalidateQueries({ queryKey: ["steel-config-qcd-criteria"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <ScreenHeader
        icon={Scale}
        title="QCD Criteria"
        subtitle="Quality/Cost/Delivery weights used by P02-A06 to compare supplier quotations. Only one active profile is used at a time."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Show inactive
        </label>
        <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Criteria
        </Button>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium text-right">Quality</th>
              <th className="py-2 px-3 font-medium text-right">Cost</th>
              <th className="py-2 px-3 font-medium text-right">Delivery</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && criteria?.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground text-xs">No QCD criteria configured — P02-S3 will show a price-only comparison.</td></tr>
            )}
            {criteria?.map((c) => (
              <tr key={c.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3">{c.name}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">{c.qualityWeight}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">{c.costWeight}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">{c.deliveryWeight}</td>
                <td className="py-2 px-3">
                  <Badge className={c.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(c); setFormOpen(true); }}>Edit</Button>
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(c)}>
                    {c.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <QcdForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
