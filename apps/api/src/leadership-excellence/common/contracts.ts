// ── 01 Strategic Direction → all later areas ─────────────────────────────

/** Lightweight status other areas read (02 header, 03 planning gate). */
export interface StrategicDirectionSummary {
  /** Approved company name; falls back to the current draft before first approval. */
  company: string;
  /** True once any version has been approved. */
  approved: boolean;
  /** Approved version number; null until the first approval. */
  version: number | null;
}

/** One core value as published (01.01). */
export interface CoreValue {
  id: string;
  name: string;
  why: string;
}

/**
 * The approved, locked company direction. Only approved content crosses
 * area boundaries — drafts and in-review revisions never leave Area 01.
 */
export interface ApprovedStrategicDirection {
  version: number;
  company: string;
  business: string;
  purpose: string;
  vision: string;
  visionWhy: string;
  mission: string;
  missionWhy: string;
  values: CoreValue[];
  approvedAt: Date;
  approvedById: string | null;
}

/** The six fixed BEES pillars (01.02). Reference data; never edited by orgs. */
export const LEX_PILLARS = [
  { code: 'LEX', name: 'Leadership Excellence' },
  { code: 'PEX', name: 'People Excellence' },
  { code: 'OPX', name: 'Operational Excellence' },
  { code: 'CMX', name: 'Customer & Market Excellence' },
  { code: 'SGEX', name: 'Sustainability & Governance Excellence' },
  { code: 'FPEX', name: 'Financial Performance Excellence' },
] as const;
export type LexPillarCode = (typeof LEX_PILLARS)[number]['code'];

/**
 * What StrategicDirectionService exports to other areas. Later areas inject the
 * service and call only these methods.
 */
export interface StrategicDirectionProvider {
  getSummary(organizationId: string): Promise<StrategicDirectionSummary>;
  /** Null until the first approval. */
  getApproved(
    organizationId: string,
  ): Promise<ApprovedStrategicDirection | null>;
}
