"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigLookup, SteelLookupType } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { FileText, Plus, Loader2 } from "lucide-react";

const LOOKUP_TABS: { value: SteelLookupType; label: string }[] = [
  { value: "PAYMENT_TERMS", label: "Payment Terms" },
  { value: "INCOTERM", label: "Incoterms" },
  { value: "CURRENCY", label: "Currency" },
  { value: "TRANSPORT_MODE", label: "Transport Mode" },
  { value: "DELIVERY_LOCATION", label: "Delivery Location" },
  { value: "DOCUMENT_TYPE", label: "Document Type" },
];

function LookupForm({ onClose, type }: { onClose: () => void; type: SteelLookupType }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => SteelConfigService.createLookup({ type, code, name }, accessToken!),
    onSuccess: () => {
      toast("Entry added.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-lookups"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const typeLabel = LOOKUP_TABS.find((t) => t.value === type)?.label ?? type;

  return (
    <AdminModal
      title={`Add ${typeLabel} Entry`}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!code.trim() || !name.trim()) {
          setError("Code and name are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel="Add Entry"
      error={error}
    >
      <div>
        <FormLabel>Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. NET30, FOB, USD" />
      </div>
      <div>
        <FormLabel>Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Net 30 Days" />
      </div>
    </AdminModal>
  );
}

export default function ProcurementTermsConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<SteelLookupType>("PAYMENT_TERMS");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: lookups, isLoading } = useQuery({
    queryKey: ["config-lookups", type, includeInactive],
    queryFn: () => SteelConfigService.listLookups(accessToken!, { type, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (l: ConfigLookup) => SteelConfigService.updateLookup(l.id, { isActive: !l.isActive }, accessToken!),
    onSuccess: () => {
      toast("Entry updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-lookups"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <ScreenHeader
        icon={FileText}
        title="Procurement Terms"
        subtitle="Payment terms, Incoterms, currency, transport modes, delivery locations, and required document types used across P02."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="flex flex-wrap gap-1.5">
        {LOOKUP_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={
              "px-3 h-8 rounded-md border text-xs font-medium transition-colors " +
              (type === t.value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-input text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Show inactive
        </label>
        <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => setFormOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Entry
        </Button>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && lookups?.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-xs">No entries configured for this type yet.</td></tr>
            )}
            {lookups?.map((l) => (
              <tr key={l.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{l.code}</td>
                <td className="py-2 px-3">{l.name}</td>
                <td className="py-2 px-3">
                  <Badge className={l.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {l.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right">
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(l)}>
                    {l.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <LookupForm type={type} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
