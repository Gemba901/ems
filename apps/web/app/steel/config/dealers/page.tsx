"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigDealer } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Truck, Plus, Loader2, Search } from "lucide-react";

function DealerForm({ onClose, editing }: { onClose: () => void; editing: ConfigDealer | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [region, setRegion] = useState(editing?.region ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? SteelConfigService.updateDealer(editing.id, { name, region: region || undefined }, accessToken!)
        : SteelConfigService.createDealer({ name, code, region: region || undefined }, accessToken!),
    onSuccess: () => {
      toast(editing ? "Dealer updated." : "Dealer created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-dealers"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Dealer" : "Add Dealer"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim() || (!editing && !code.trim())) {
          setError("Dealer name and code are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Dealer"}
      error={error}
    >
      <div>
        <FormLabel>Dealer Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nairobi Steel Distributors" />
      </div>
      <div>
        <FormLabel>Dealer Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. DLR-NBI" disabled={!!editing} />
      </div>
      <div>
        <FormLabel>Region (optional)</FormLabel>
        <Input className="h-8" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Nairobi" />
      </div>
    </AdminModal>
  );
}

export default function DealersConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigDealer | null>(null);

  const { data: dealers, isLoading } = useQuery({
    queryKey: ["config-dealers", q, includeInactive],
    queryFn: () => SteelConfigService.listDealers(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (d: ConfigDealer) => SteelConfigService.updateDealer(d.id, { isActive: !d.isActive }, accessToken!),
    onSuccess: () => {
      toast("Dealer updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-dealers"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader icon={Truck} title="Dealers" subtitle="Dealer master data used by P01 demand capture." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dealers..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Dealer
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Region</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && dealers?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No dealers found.</td></tr>
            )}
            {dealers?.map((d) => (
              <tr key={d.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{d.code}</td>
                <td className="py-2 px-3">{d.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{d.region ?? "—"}</td>
                <td className="py-2 px-3">
                  <Badge className={d.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {d.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(d); setFormOpen(true); }}>Edit</Button>
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(d)}>
                    {d.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <DealerForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
