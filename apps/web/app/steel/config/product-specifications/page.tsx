"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigProductSpecification } from "@/services/steel-config.service";
import { SteelMasterDataService } from "@/services/steel-master-data.service";
import { MasterDataCombobox, ComboboxOption } from "@/components/steel/p01/MasterDataCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { FileText, Plus, Loader2, Search } from "lucide-react";

function SpecForm({ onClose, editing }: { onClose: () => void; editing: ConfigProductSpecification | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [product, setProduct] = useState<ComboboxOption | null>(
    editing ? { value: editing.productId, label: editing.product.name } : null,
  );
  const [code, setCode] = useState(editing?.code ?? "");
  const [grade, setGrade] = useState(editing?.grade ?? "");
  const [size, setSize] = useState(editing?.size ?? "");
  const [standard, setStandard] = useState(editing?.standard ?? "");
  const [length, setLength] = useState(editing?.length ?? "");
  const [toleranceNotes, setToleranceNotes] = useState(editing?.toleranceNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? SteelConfigService.updateSpecification(editing.id, { grade, size, standard, length: length || undefined, toleranceNotes: toleranceNotes || undefined }, accessToken!)
        : SteelConfigService.createSpecification(
            { productId: product!.value, code, grade, size, standard, length: length || undefined, toleranceNotes: toleranceNotes || undefined },
            accessToken!,
          ),
    onSuccess: () => {
      toast(editing ? "Specification updated." : "Specification created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-specs"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Specification" : "Add Product Specification"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!editing && (!product || !code.trim())) {
          setError("Product and specification code are required.");
          return;
        }
        if (!grade.trim() || !size.trim() || !standard.trim()) {
          setError("Grade, size, and standard are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Specification"}
      error={error}
    >
      {!editing && (
        <div>
          <FormLabel>Product</FormLabel>
          <MasterDataCombobox
            value={product}
            onChange={setProduct}
            queryKey={["config-products-lookup"]}
            fetchOptions={async (q) => {
              const products = await SteelMasterDataService.getProducts(accessToken!, { q });
              return products.map((p) => ({ value: p.id, label: p.name, description: p.code }));
            }}
            placeholder="Search products..."
          />
        </div>
      )}
      {!editing && (
        <div>
          <FormLabel>Specification Code</FormLabel>
          <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TMT-12" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Grade</FormLabel>
          <Input className="h-8" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Grade 500" />
        </div>
        <div>
          <FormLabel>Size</FormLabel>
          <Input className="h-8" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 12 mm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Standard</FormLabel>
          <Input className="h-8" value={standard} onChange={(e) => setStandard(e.target.value)} placeholder="e.g. BS 4449" />
        </div>
        <div>
          <FormLabel>Length (optional)</FormLabel>
          <Input className="h-8" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 12 m" />
        </div>
      </div>
      <div>
        <FormLabel>Tolerance Notes (optional)</FormLabel>
        <Input className="h-8" value={toleranceNotes} onChange={(e) => setToleranceNotes(e.target.value)} />
      </div>
    </AdminModal>
  );
}

export default function ProductSpecificationsConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigProductSpecification | null>(null);

  const { data: specs, isLoading } = useQuery({
    queryKey: ["config-specs", q, includeInactive],
    queryFn: () => SteelConfigService.listSpecifications(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (s: ConfigProductSpecification) => SteelConfigService.updateSpecification(s.id, { isActive: !s.isActive }, accessToken!),
    onSuccess: () => {
      toast("Specification updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-specs"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <ScreenHeader icon={FileText} title="Product Specifications" subtitle="Grade, size, standard, and length per product." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search specifications..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Specification
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Display Label</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && specs?.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No specifications found.</td></tr>
            )}
            {specs?.map((s) => (
              <tr key={s.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{s.code}</td>
                <td className="py-2 px-3">{s.displayLabel}</td>
                <td className="py-2 px-3">
                  <Badge className={s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(s); setFormOpen(true); }}>Edit</Button>
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(s)}>
                    {s.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <SpecForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
