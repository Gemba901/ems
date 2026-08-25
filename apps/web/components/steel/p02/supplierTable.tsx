"use client";

import { Supplier, SupplierApprovalStatus } from "@/services/steel-sourcing.service";
import { Badge } from "@/components/ui/badge";
import { DocGrid, DocField, SummaryBlock } from "@/components/steel/p02/document";
import { Check } from "lucide-react";

export const APPROVAL_STYLES: Record<SupplierApprovalStatus, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-orange-50 text-orange-700",
  BLACKLISTED: "bg-red-50 text-red-700",
};

/**
 * Professional supplier comparison table — Supplier / Approval / Location /
 * Quality / Status — shared between S2 (Supplier Assessment) and S3
 * (Sourcing Decision) so both read from the same controlled Supplier Master
 * columns instead of each screen inventing its own layout.
 */
export function SupplierComparisonTable({
  suppliers, selectedId, onSelect,
}: { suppliers: Supplier[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm border-collapse min-w-[680px]">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-input">
            <th className="py-2 px-2 font-medium w-8" />
            <th className="py-2 px-2 font-medium">Supplier</th>
            <th className="py-2 px-2 font-medium">Email</th>
            <th className="py-2 px-2 font-medium">Approval</th>
            <th className="py-2 px-2 font-medium">Location</th>
            <th className="py-2 px-2 font-medium">Quality</th>
            <th className="py-2 px-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => {
            const selected = s.id === selectedId;
            return (
              <tr
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={"cursor-pointer border-b border-input/50 last:border-0 transition-colors " + (selected ? "bg-blue-50" : "hover:bg-muted/40")}
              >
                <td className="py-2.5 px-2">
                  {selected && (
                    <div className="h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-2 font-medium text-foreground">
                  {s.name}
                  {s.materialTypes.length > 0 && (
                    <p className="text-xs font-normal text-muted-foreground">{s.materialTypes.join(", ").replace(/_/g, " ")}</p>
                  )}
                </td>
                <td className="py-2.5 px-2 text-muted-foreground">{s.email ?? "—"}</td>
                <td className="py-2.5 px-2">
                  <Badge className={APPROVAL_STYLES[s.approvalStatus]}>{s.approvalStatus}</Badge>
                </td>
                <td className="py-2.5 px-2 text-muted-foreground">
                  {s.country ?? "—"}{s.isImportSource ? " (Import)" : ""}
                </td>
                <td className="py-2.5 px-2 text-muted-foreground">{s.qualityScore != null ? s.qualityScore.toFixed(1) : "—"}</td>
                <td className="py-2.5 px-2">
                  <Badge className={s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Existing quality/rejection data only — never invents history. */
export function SupplierQualityPanel({ supplier }: { supplier: Supplier }) {
  const hasHistory = supplier.rejectionCount > 0 || supplier.qualityScore != null || supplier.deliveryScore != null;
  return (
    <div className="space-y-3">
      <DocGrid cols={4}>
        <DocField label="Quality Score" value={supplier.qualityScore != null ? supplier.qualityScore.toFixed(1) : null} />
        <DocField label="Delivery Score" value={supplier.deliveryScore != null ? supplier.deliveryScore.toFixed(1) : null} />
        <DocField label="Rejection Count" value={supplier.rejectionCount > 0 ? supplier.rejectionCount : null} />
        <DocField label="Approval Status" value={<Badge className={APPROVAL_STYLES[supplier.approvalStatus]}>{supplier.approvalStatus}</Badge>} />
      </DocGrid>
      {!hasHistory && (
        <SummaryBlock tone="neutral">No supplier quality history available.</SummaryBlock>
      )}
      <p className="text-xs text-muted-foreground">
        Source: Supplier Master — {supplier.createdBy ? `Configured by ${supplier.createdBy.firstName} ${supplier.createdBy.lastName}` : "Configured by —"}
      </p>
    </div>
  );
}
