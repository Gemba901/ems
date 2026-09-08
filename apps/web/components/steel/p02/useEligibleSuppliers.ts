import { useQuery } from "@tanstack/react-query";
import { SteelSourcingService, SteelSourcingOrder, Supplier } from "@/services/steel-sourcing.service";
import { SteelConfigService } from "@/services/steel-config.service";
import { decodeMaterialCode } from "@/components/steel/p02/materialRef";

/**
 * Resolves the controlled supplier list for a sourcing order's confirmed
 * material: Material Master (via the code encoded in materialTypeNotes by
 * S1) → Supplier/Material Eligibility (SteelSupplierMaterial) → active,
 * eligible suppliers. Used by both S2 (Approved Supplier List) and S3
 * (Sourcing Decision) so a supplier is never free-typed in either screen.
 *
 * Falls back to the supplier's coarse `materialTypes[]` classification only
 * for orders confirmed before the Material Master encoding existed (no
 * material match) — `usedEligibility` tells the caller which path was used
 * so it can show the right empty-state copy.
 */
export function useEligibleSuppliers(order: SteelSourcingOrder, token: string) {
  const materialsQuery = useQuery({
    queryKey: ["steel-config-materials", "active"],
    queryFn: () => SteelConfigService.listMaterials(token),
    enabled: !!token,
  });

  const code = decodeMaterialCode(order.materialTypeNotes);
  const material = materialsQuery.data?.find((m) => m.code === code) ?? null;

  const eligibilityQuery = useQuery({
    queryKey: ["steel-config-supplier-materials", material?.id],
    queryFn: () => SteelConfigService.listSupplierMaterials(token, { materialId: material!.id }),
    enabled: !!token && !!material,
  });

  const allSuppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => SteelSourcingService.getSuppliers(token),
    enabled: !!token,
  });

  const isLoading = materialsQuery.isLoading || (!!material && eligibilityQuery.isLoading) || allSuppliersQuery.isLoading;
  const isError = materialsQuery.isError || eligibilityQuery.isError || allSuppliersQuery.isError;

  let eligibleSuppliers: Supplier[] = [];
  const usedEligibility = !!material;

  if (material) {
    const seen = new Set<string>();
    for (const row of eligibilityQuery.data ?? []) {
      if (row.isEligible && row.isActive && row.supplier?.isActive && !seen.has(row.supplier.id)) {
        seen.add(row.supplier.id);
        eligibleSuppliers.push(row.supplier);
      }
    }
  } else if (order.materialType) {
    eligibleSuppliers = (allSuppliersQuery.data ?? []).filter((s) => s.materialTypes.includes(order.materialType!));
  }

  const refetch = () => {
    materialsQuery.refetch();
    eligibilityQuery.refetch();
    allSuppliersQuery.refetch();
  };

  return { isLoading, isError, material, usedEligibility, eligibleSuppliers, refetch };
}
