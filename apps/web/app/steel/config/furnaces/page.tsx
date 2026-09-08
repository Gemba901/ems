"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { FurnaceService, Furnace, FurnaceStatus } from "@/services/steel-furnace.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Flame, Plus, Loader2, Search } from "lucide-react";

const FURNACE_STATUSES: FurnaceStatus[] = ["READY", "MAINTENANCE", "DOWN", "RETIRED"];
const STATUS_STYLES: Record<FurnaceStatus, string> = {
  READY: "bg-emerald-50 text-emerald-700",
  MAINTENANCE: "bg-amber-50 text-amber-700",
  DOWN: "bg-red-50 text-red-700",
  RETIRED: "bg-muted text-muted-foreground",
};

function FurnaceForm({ onClose, editing }: { onClose: () => void; editing: Furnace | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [status, setStatus] = useState<FurnaceStatus>(editing?.status ?? "READY");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? FurnaceService.update(editing.id, { name, status, notes: notes || undefined }, accessToken!)
        : FurnaceService.create({ code, name, status, notes: notes || undefined }, accessToken!),
    onSuccess: () => {
      toast(editing ? "Furnace updated." : "Furnace created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-furnaces"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Furnace" : "Add Furnace"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim() || (!editing && !code.trim())) {
          setError("Furnace name and code are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Furnace"}
      error={error}
    >
      <div>
        <FormLabel>Furnace Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Furnace 1" />
      </div>
      <div>
        <FormLabel>Furnace Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. F1" disabled={!!editing} />
      </div>
      <div>
        <FormLabel>Status</FormLabel>
        <select className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value as FurnaceStatus)}>
          {FURNACE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <FormLabel>Notes (optional)</FormLabel>
        <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </AdminModal>
  );
}

export default function FurnacesConfigPage() {
  const { accessToken } = useAuthStore();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Furnace | null>(null);

  const { data: furnaces, isLoading } = useQuery({
    queryKey: ["config-furnaces", q],
    queryFn: () => FurnaceService.getAll(accessToken!, { search: q }),
    enabled: !!accessToken,
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader
        icon={Flame}
        title="Equipment / Furnaces"
        subtitle="Furnace and lining master data — the same records used operationally by P05 Melting."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search furnaces..." />
        </div>
        <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" /> Add Furnace
        </Button>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Active Lining</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && furnaces?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No furnaces found.</td></tr>
            )}
            {furnaces?.map((f) => (
              <tr key={f.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{f.code}</td>
                <td className="py-2 px-3">{f.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{f.linings[0]?.condition ?? "No active lining"}</td>
                <td className="py-2 px-3">
                  <Badge className={STATUS_STYLES[f.status]}>{f.status}</Badge>
                </td>
                <td className="py-2 px-3 text-right">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(f); setFormOpen(true); }}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <FurnaceForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
