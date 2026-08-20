-- Adds an explicit STATUS_OVERRIDE activity value to each Steel module's
-- activity enum so the existing updateStatus() admin-override endpoints can
-- log what they do, matching how every other action in P01-P04 is logged.
-- Additive only: no existing enum values are removed or renamed.

ALTER TYPE "SteelPlanActivity" ADD VALUE 'STATUS_OVERRIDE';
ALTER TYPE "SteelSourcingActivity" ADD VALUE 'STATUS_OVERRIDE';
ALTER TYPE "SteelIntakeActivity" ADD VALUE 'STATUS_OVERRIDE';
ALTER TYPE "SteelChargeActivity" ADD VALUE 'STATUS_OVERRIDE';
