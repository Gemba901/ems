"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigMaterial } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Boxes, Plus, Loader2, Search } from "lucide-react";

function MaterialForm({ onClose, editing }: { onClose: () => void; editing: ConfigMaterial | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [unit, setUnit] = useState(editing?.unit ?? "MT");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? SteelConfigService.updateMaterial(editing.id, { name, unit }, accessToken!)
        : SteelConfigService.createMaterial({ name, code, unit }, accessToken!),
    onSuccess: () => {
      toast(editing ? "Material updated." : "Material created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-materials"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Material" : "Add Material"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim() || (!editing && !code.trim()) || !unit.trim()) {
          setError("Material name, code, and unit are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Material"}
      error={error}
    >
      <div>
        <FormLabel>Material Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steel Scrap" />
      </div>
      <div>
        <FormLabel>Material Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MAT-SCRAP" disabled={!!editing} />
      </div>
      <div>
        <FormLabel>Unit</FormLabel>
        <Input className="h-8" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. MT, KG, NOS" />
      </div>
    </AdminModal>
  );
}

export default function MaterialsConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigMaterial | null>(null);

  const { data: materials, isLoading } = useQuery({
    queryKey: ["config-materials", q, includeInactive],
    queryFn: () => SteelConfigService.listMaterials(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (m: ConfigMaterial) => SteelConfigService.updateMaterial(m.id, { isActive: !m.isActive }, accessToken!),
    onSuccess: () => {
      toast("Material updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-materials"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader icon={Boxes} title="Materials" subtitle="Raw-material catalog. Actual stock quantities remain owned by P03." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search materials..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Material
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Unit</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && materials?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No materials found.</td></tr>
            )}
            {materials?.map((m) => (
              <tr key={m.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{m.code}</td>
                <td className="py-2 px-3">{m.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{m.unit}</td>
                <td className="py-2 px-3">
                  <Badge className={m.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {m.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(m); setFormOpen(true); }}>Edit</Button>
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(m)}>
                    {m.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <MaterialForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
