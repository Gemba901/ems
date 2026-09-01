"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import {
  SteelSourcingService,
  Supplier,
  SteelMaterialType,
  SupplierApprovalStatus,
} from "@/services/steel-sourcing.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { APPROVAL_STYLES } from "@/components/steel/p02/supplierTable";
import { Users, Plus, Loader2, Search } from "lucide-react";

// This is Steel Configuration's admin view over the existing Supplier master
// (Supplier model + /steel/sourcing/suppliers endpoints, which already back
// P02-A03/A04) — reused as-is rather than duplicated under a new model. Only
// the missing update/deactivate path and this admin UI were added.
const MATERIAL_TYPES: { value: SteelMaterialType; label: string }[] = [
  { value: "SCRAP", label: "Scrap" },
  { value: "DRI", label: "DRI" },
  { value: "BILLET", label: "Billet" },
  { value: "ALLOY", label: "Alloy" },
  { value: "ADDITIVE", label: "Additive" },
  { value: "FUEL", label: "Fuel" },
  { value: "REFRACTORY", label: "Refractory" },
  { value: "PACKING_MATERIAL", label: "Packing Material" },
  { value: "OTHER", label: "Other" },
];

const APPROVAL_STATUSES: SupplierApprovalStatus[] = ["APPROVED", "PENDING", "SUSPENDED", "BLACKLISTED"];

function SupplierForm({ onClose, editing }: { onClose: () => void; editing: Supplier | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [materialTypes, setMaterialTypes] = useState<SteelMaterialType[]>(editing?.materialTypes ?? []);
  const [approvalStatus, setApprovalStatus] = useState<SupplierApprovalStatus>(editing?.approvalStatus ?? "PENDING");
  const [country, setCountry] = useState(editing?.country ?? "");
  const [isImportSource, setIsImportSource] = useState(editing?.isImportSource ?? false);
  const [contactPerson, setContactPerson] = useState(editing?.contactPerson ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const toggleType = (t: SteelMaterialType) =>
    setMaterialTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name,
        code: code || undefined,
        materialTypes,
        approvalStatus,
        country: country || undefined,
        isImportSource,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
        notes: notes || undefined,
      };
      return editing
        ? SteelSourcingService.updateSupplier(editing.id, data, accessToken!)
        : SteelSourcingService.createSupplier(data, accessToken!);
    },
    onSuccess: () => {
      toast(editing ? "Supplier updated." : "Supplier created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Supplier" : "Add Supplier"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) {
          setError("Supplier name is required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Supplier"}
      error={error}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Supplier Name</FormLabel>
          <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coastal Metal Traders" />
        </div>
        <div>
          <FormLabel>Supplier Code (optional)</FormLabel>
          <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SUP-001" />
        </div>
      </div>

      <div>
        <FormLabel>Materials Supplied</FormLabel>
        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_TYPES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => toggleType(m.value)}
              className={
                "px-2.5 h-7 rounded-md border text-xs font-medium transition-colors " +
                (materialTypes.includes(m.value) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-input text-muted-foreground hover:text-foreground")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Approval Status</FormLabel>
          <select
            className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
            value={approvalStatus}
            onChange={(e) => setApprovalStatus(e.target.value as SupplierApprovalStatus)}
          >
            {APPROVAL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <FormLabel>Country (optional)</FormLabel>
          <Input className="h-8" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Kenya" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isImportSource} onChange={(e) => setIsImportSource(e.target.checked)} />
        Import source (vs. local)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Contact Person (optional)</FormLabel>
          <Input className="h-8" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <FormLabel>Phone (optional)</FormLabel>
          <Input className="h-8" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div>
        <FormLabel>Email (optional)</FormLabel>
        <Input className="h-8" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <FormLabel>Notes (optional)</FormLabel>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
    </AdminModal>
  );
}

export default function SuppliersConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["config-suppliers", search, includeInactive],
    queryFn: () => SteelSourcingService.getSuppliers(accessToken!, { search, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (s: Supplier) => SteelSourcingService.updateSupplier(s.id, { isActive: !s.isActive }, accessToken!),
    onSuccess: () => {
      toast("Supplier updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <ScreenHeader
        icon={Users}
        title="Suppliers"
        subtitle="Supplier master used by P02 procurement — approval status, materials supplied, and location."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Supplier
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Materials</th>
              <th className="py-2 px-3 font-medium">Approval</th>
              <th className="py-2 px-3 font-medium">Location</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && suppliers?.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground text-xs">No suppliers found.</td></tr>
            )}
            {suppliers?.map((s) => (
              <tr key={s.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{s.code ?? "—"}</td>
                <td className="py-2 px-3">{s.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{s.materialTypes.length > 0 ? s.materialTypes.join(", ").replace(/_/g, " ") : "—"}</td>
                <td className="py-2 px-3">
                  <Badge className={APPROVAL_STYLES[s.approvalStatus]}>{s.approvalStatus}</Badge>
                </td>
                <td className="py-2 px-3 text-muted-foreground">{s.country ?? "—"}{s.isImportSource ? " (Import)" : ""}</td>
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

      {formOpen && <SupplierForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
