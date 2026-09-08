"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ConfigProduct } from "@/services/steel-config.service";
import type { ProductType } from "@/services/steel-master-data.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { AdminModal, FormLabel } from "@/components/steel/config/AdminModal";
import { Package, Plus, Loader2, Search } from "lucide-react";

const PRODUCT_TYPES: ProductType[] = ["TMT_BAR", "BILLET", "WIRE_ROD", "SECTION", "OTHER"];

function ProductForm({ onClose, editing }: { onClose: () => void; editing: ConfigProduct | null }) {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [productType, setProductType] = useState<ProductType>(editing?.productType ?? "TMT_BAR");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? SteelConfigService.updateProduct(editing.id, { name, productType }, accessToken!)
        : SteelConfigService.createProduct({ name, code, productType }, accessToken!),
    onSuccess: () => {
      toast(editing ? "Product updated." : "Product created.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-products"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <AdminModal
      title={editing ? "Edit Product" : "Add Product"}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!name.trim() || !code.trim()) {
          setError("Product name and code are required.");
          return;
        }
        mutation.mutate();
      }}
      submitting={mutation.isPending}
      submitLabel={editing ? "Save Changes" : "Add Product"}
      error={error}
    >
      <div>
        <FormLabel>Product Name</FormLabel>
        <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TMT Reinforcement Bar" />
      </div>
      <div>
        <FormLabel>Product Code</FormLabel>
        <Input className="h-8" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TMT-001" disabled={!!editing} />
      </div>
      <div>
        <FormLabel>Product Type</FormLabel>
        <select
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
          value={productType}
          onChange={(e) => setProductType(e.target.value as ProductType)}
        >
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
    </AdminModal>
  );
}

export default function ProductsConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigProduct | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["config-products", q, includeInactive],
    queryFn: () => SteelConfigService.listProducts(accessToken!, { q, includeInactive }),
    enabled: !!accessToken,
  });

  const toggleActive = useMutation({
    mutationFn: (p: ConfigProduct) => SteelConfigService.updateProduct(p.id, { isActive: !p.isActive }, accessToken!),
    onSuccess: () => {
      toast("Product updated.", "success");
      queryClient.invalidateQueries({ queryKey: ["config-products"] });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <ScreenHeader icon={Package} title="Products" subtitle="Company product catalog used by P01 demand capture." backHref="/steel/config" backLabel="Configuration" />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-8 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Show inactive
          </label>
          <Button size="sm" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add Product
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-input overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-input bg-muted/30">
              <th className="py-2 px-3 font-medium">Code</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Type</th>
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></td></tr>
            )}
            {!isLoading && products?.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-muted-foreground text-xs">No products found.</td></tr>
            )}
            {products?.map((p) => (
              <tr key={p.id} className="border-b border-input/50 last:border-0">
                <td className="py-2 px-3 font-mono text-xs">{p.code}</td>
                <td className="py-2 px-3">{p.name}</td>
                <td className="py-2 px-3 text-muted-foreground">{p.productType.replace(/_/g, " ")}</td>
                <td className="py-2 px-3">
                  <Badge className={p.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}>
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-right space-x-2">
                  <Button size="xs" variant="outline" onClick={() => { setEditing(p); setFormOpen(true); }}>Edit</Button>
                  <Button size="xs" variant="outline" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(p)}>
                    {p.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && <ProductForm editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}
