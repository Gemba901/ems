-- Enforce at the database level that a single P03 material intake can be
-- allocated into at most one P04 charge preparation. Previously only
-- (chargePreparationId, intakeId) was unique, which allowed the same
-- intakeId to be inserted under different chargePreparationId rows under
-- concurrent requests. Verified against the live database before this
-- migration was written: SteelChargeMaterialLot had 0 rows, so no
-- conflicting duplicate allocations exist to resolve.

-- DropIndex
DROP INDEX "SteelChargeMaterialLot_intakeId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "SteelChargeMaterialLot_intakeId_key" ON "SteelChargeMaterialLot"("intakeId");
