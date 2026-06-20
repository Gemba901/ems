-- Create VisitMonthPlan: tracks how many consultancy visits are planned per client org per month
CREATE TABLE "VisitMonthPlan" (
  "id"          TEXT NOT NULL,
  "clientOrgId" TEXT NOT NULL,
  "year"        INTEGER NOT NULL,
  "month"       INTEGER NOT NULL,
  "plannedDays" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitMonthPlan_pkey" PRIMARY KEY ("id")
);

-- Unique: one plan per client org per month
CREATE UNIQUE INDEX "VisitMonthPlan_clientOrgId_year_month_key"
  ON "VisitMonthPlan"("clientOrgId", "year", "month");

-- Foreign keys
ALTER TABLE "VisitMonthPlan"
  ADD CONSTRAINT "VisitMonthPlan_clientOrgId_fkey"
  FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisitMonthPlan"
  ADD CONSTRAINT "VisitMonthPlan_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create VisitPlanSlot: individual planned visit slots within a month plan
CREATE TABLE "VisitPlanSlot" (
  "id"        TEXT NOT NULL,
  "planId"    TEXT NOT NULL,
  "slotIndex" INTEGER NOT NULL,
  "date"      TIMESTAMP(3),
  "agenda"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitPlanSlot_pkey" PRIMARY KEY ("id")
);

-- Unique: one slot per index per plan
CREATE UNIQUE INDEX "VisitPlanSlot_planId_slotIndex_key"
  ON "VisitPlanSlot"("planId", "slotIndex");

-- Foreign key with cascade delete (slots go when plan goes)
ALTER TABLE "VisitPlanSlot"
  ADD CONSTRAINT "VisitPlanSlot_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "VisitMonthPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
