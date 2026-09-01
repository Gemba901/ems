"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigCustomer } from "@/services/steel-config.service";
import type { CreditStatus } from "@/services/steel-master-data.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Users, Plus, Loader2, Search } from "lucide-react";

const CREDIT_STATUSES: CreditStatus[] = ["APPROVED", "ON_HOLD", "PENDING"];

function CustomerForm({ onClose, editing }: { onClose: () => void; editing: ConfigCustomer | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [deliveryLocation, setDeliveryLocation] = useState(editing?.defaultDeliveryLocation ?? "");
  const [creditStatus, setCreditStatus] = useState<CreditStatus | "">(editing?.creditStatus ?? "");
  const [contactPerson, setContactPerson] = useState(editing?.contactPerson ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        name,
        defaultDeliveryLocation: deliveryLocation || undefined,
        creditStatus: creditStatus || undefined,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        email: email || undefined,
      };
      return editing
        ? SteelConfigService.updateCustomer(editing.id, data, accessToken!)
        : SteelConfigService.createCustomer(data, accessToken!);
    },
    onSuccess: () => {
      toast(editing ? "Customer updated." : "Customer created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-customers"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Customer" : "Add Customer"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim()) {
          setError("Customer name is required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Customer"}
      error={error}
    >
      <div>
        <FormLabel>Customer Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eastland Construction Ltd" />
      </div>
      <div>
        <FormLabel>Default Delivery Location</FormLabel>
        <Input className="h-8" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <FormLabel>Credit Status</FormLabel>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          value={creditStatus}
          onChange={(e) => setCreditStatus(e.target.value as CreditStatus | "")}
        >
          <option value="">— Not set —</option>
          {CREDIT_STATUSES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FormLabel>Contact Person</FormLabel>
          <Input className="h-8" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <FormLabel>Phone</FormLabel>
          <Input className="h-8" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div>
        <FormLabel>Email</FormLabel>
        <Input className="h-8" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
      </div>
    </AdminModal>
  );
}

export default function CustomersConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigCustomer | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["config-customers", q, includeInactive],
    queryFn: () => SteelConfigService.listCustomers(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (c: ConfigCustomer) => SteelConfigService.updateCustomer(c.id, { isActive: !c.isActive }, accessToken!),
    onSuccess: () => {
      toast("Customer updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-customers"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader icon={Users} title="Customers" subtitle="Customer master data used by P01 demand capture." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Customer
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Delivery Location</th>
              <th className="py-2 px-3 font-medium">Credit Status</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && customers?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No customers found.</td></tr>
            )}
            {customers?.map((c) => (
              <tr key={c.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3">{c.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{c.defaultDeliveryLocation ?? "—"}</td>
                <td className="py-2 px-3 text-muted-foreground">{c.creditStatus?.replace(/_/g, " ") ?? "—"}</td>
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

      {formOpen && <CustomerForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
