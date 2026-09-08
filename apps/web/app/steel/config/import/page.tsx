"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/contexts/toast.context";
import { SteelConfigService, ImportEntity, ImportPreviewResult } from "@/services/steel-config.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScreenHeader } from "@/components/steel/ScreenHeader";
import { Upload, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const ENTITIES: { value: ImportEntity; label: string; columns: string }[] = [
  { value: "products", label: "Products", columns: "name, code, productType" },
  { value: "product-specifications", label: "Product Specifications", columns: "productCode, code, grade, size, standard, length, toleranceNotes" },
  { value: "customers", label: "Customers", columns: "name, defaultDeliveryLocation, creditStatus" },
  { value: "dealers", label: "Dealers", columns: "name, code, region" },
  { value: "materials", label: "Materials", columns: "name, code, unit" },
  { value: "production-routes", label: "Production Routes", columns: "name, code, plantRoute" },
];

function downloadTemplate(entity: ImportEntity, columns: string) {
  const header = columns.split(", ").join(",");
  const blob = new Blob([header + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${entity}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportConfigPage() {
  const { accessToken } = useAuthStore();
  const { toast } = useToast();
  const [entity, setEntity] = useState<ImportEntity>("products");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = ENTITIES.find((e) => e.value === entity)!;

  const previewMutation = useMutation({
    mutationFn: () => SteelConfigService.previewImport(entity, file!, accessToken!),
    onSuccess: (result) => setPreview(result),
    onError: (err: Error) => toast(err.message, "error"),
  });

  const commitMutation = useMutation({
    mutationFn: () => SteelConfigService.commitImport(entity, file!, accessToken!),
    onSuccess: (result) => {
      toast(`Imported ${result.created} record(s).`, "success");
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <ScreenHeader
        icon={Upload}
        title="Import / Export"
        subtitle="Bulk-load master data from a CSV or Excel file. Existing codes are never overwritten."
        backHref="/steel/config"
        backLabel="Configuration"
      />

      <div className="rounded-lg border border-input bg-background p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Data Type</label>
          <select
            className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
            value={entity}
            onChange={(e) => { setEntity(e.target.value as ImportEntity); setPreview(null); setFile(null); }}
          >
            {ENTITIES.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Columns: {selected.columns}</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="text-sm flex-1"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
          />
          <Button size="sm" variant="outline" onClick={() => downloadTemplate(entity, selected.columns)}>
            Download Template
          </Button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={!file || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
            disabled={!preview || preview.validCount === 0 || commitMutation.isPending}
            onClick={() => commitMutation.mutate()}
          >
            {commitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Import ${preview?.validCount ?? 0} Valid Record(s)`}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-input bg-background p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-50 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> {preview.validCount} valid</Badge>
            <Badge className="bg-red-50 text-red-700 gap-1"><AlertTriangle className="h-3 w-3" /> {preview.errorCount} error(s)</Badge>
            <span className="text-xs text-muted-foreground">{preview.totalRows} row(s) total</span>
          </div>
          {preview.errorCount > 0 && (
            <div className="rounded-md border border-input overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-input bg-muted/30">
                    <th className="py-1.5 px-2 font-medium">Row</th>
                    <th className="py-1.5 px-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.filter((r) => r.errors.length > 0).map((r) => (
                    <tr key={r.row} className="border-b border-input/50 last:border-0">
                      <td className="py-1.5 px-2">{r.row}</td>
                      <td className="py-1.5 px-2 text-red-600">{r.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
