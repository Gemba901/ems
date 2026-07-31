-- Add KAIZEN to ModuleType so it can be enabled per-organization.
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'KAIZEN';
