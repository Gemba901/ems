"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigSupplierMaterial } from "@/services/steel-config.service";
import { SteelSourcingService } from "@/services/steel-sourcing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Link2, Plus, Loader2, Trash2 } from "lucide-react";

// Answers "which approved suppliers can supply this material?" for P02-A03 —
// links the existing Supplier master to the existing Material Master
// (SteelSupplierMaterial, added for the P02 data foundation). Neither entity
// is duplicated here; this page only manages the relationship between them.
function EligibilityForm({ onClose }: { onClose: () => void }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [specificationReference, setSpecificationReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["config-suppliers-all"],
    queryFn: () => SteelSourcingService.getSuppliers(accessToken!),
    enabled: !!accessToken,
  });
  const materialsQuery = useQuery({
    queryKey: ["steel-config-materials", "active"],
    queryFn: () => SteelConfigService.listMaterials(accessToken!),
    enabled: !!accessToken,
  });

  const mutation = useMutation({
    mutationFn: () =>
      SteelConfigService.createSupplierMaterial(
        { supplierId, materialId, specificationReference: specificationReference || undefined },
        accessToken!,
      ),
    onSuccess: () => {
      toast("Supplier linked to material.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-supplier-materials"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title="Link Supplier to Material"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!supplierId || !materialId) {
          setError("Select both a supplier and a material.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel="Link Supplier"
      error={error}
    >
      <div>
        <FormLabel>Supplier</FormLabel>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">Select a supplier...</option>
          {suppliersQuery.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ""}{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <FormLabel>Material</FormLabel>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
        >
          <option value="">Select a material...</option>
          {materialsQuery.data?.map((m) => (
            <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
          ))}
        </select>
      </div>
      <div>
        <FormLabel>Specification Reference (optional)</FormLabel>
        <Input className="h-8" value={specificationReference} onChange={(e) => setSpecificationReference(e.target.value)} placeholder="Supplier-specific spec, if different" />
      </div>
    </AdminModal>
  );
}

export default function SupplierEligibilityConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["config-supplier-materials"],
    queryFn: () => SteelConfigService.listSupplierMaterials(accessToken!),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (r: ConfigSupplierMaterial) => SteelConfigService.updateSupplierMaterial(r.id, { isActive: !r.isActive }, accessToken!),
    onSuccess: () => {
      toast("Eligibility updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-supplier-materials"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const remove = useMutation({
    mutationFn: (r: ConfigSupplierMaterial) => SteelConfigService.deleteSupplierMaterial(r.id, accessToken!),
    onSuccess: () => {
      toast("Link removed.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-supplier-materials"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader
        icon={Link2}
        title="Supplier Eligibility"
        subtitle="Which approved suppliers can supply which materials — used by P02-A03/S3 to filter supplier selection."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="flex items-center justify-end">
        <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Link Supplier to Material
        </Button>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Supplier</th>
              <th className="py-2 px-3 font-medium">Material</th>
              <th className="py-2 px-3 font-medium">Specification</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && rows?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No supplier-material links yet.</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3">{r.supplier?.name ?? "—"}</td>
                <td className="py-2 px-3">{r.material ? `${r.material.code} — ${r.material.name}` : "—"}</td>
                <td className="py-2 px-3 text-muted-foreground">{r.specificationReference ?? "—"}</td>
                <td className="py-2 px-3">
                  <Badge className={r.isActive && r.isEligible ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {r.isActive ? (r.isEligible ? "Eligible" : "Not Eligible") : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(r)}>
                    {r.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="xs" variant="outline" className="text-red-600 hover:text-red-700" disabled={remove.isPending} onClick={() => remove.mutate(r)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <EligibilityForm onClose={() => setFormOpen(false)} />}
    </div>
  );
}
