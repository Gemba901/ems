// This utility is framework-free; use the same rules as organization creation.
import {
  getOrganizationSlugError,
  normalizeOrganizationSlug,
} from '../../../../apps/api/src/common/utils/organization-slug';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
}

export interface SlugChange {
  organizationId: string;
  name: string;
  slug: string;
}

export function planSlugBackfill(organizations: OrganizationRow[], mapping: unknown) {
  if (!Array.isArray(mapping)) throw new Error('Mapping must be a JSON array.');
  const byId = new Map(organizations.map((org) => [org.id, org]));
  const owners = new Map<string, string>();
  for (const org of organizations) {
    if (org.slug === null) continue;
    const normalized = normalizeOrganizationSlug(org.slug);
    if (normalized !== org.slug || getOrganizationSlugError(normalized)) {
      throw new Error(`Existing slug for ${org.id} is invalid; review it separately.`);
    }
    if (owners.has(normalized)) throw new Error(`Existing duplicate slug: ${normalized}`);
    owners.set(normalized, org.id);
  }

  const seenIds = new Set<string>();
  const changes: SlugChange[] = [];
  const skipped: string[] = [];
  for (const entry of mapping) {
    if (!entry || typeof entry !== 'object' ||
        typeof entry.organizationId !== 'string' || typeof entry.slug !== 'string') {
      throw new Error('Every mapping entry must contain organizationId and slug strings.');
    }
    const { organizationId } = entry;
    if (seenIds.has(organizationId)) throw new Error(`Repeated organization ID: ${organizationId}`);
    seenIds.add(organizationId);
    const org = byId.get(organizationId);
    if (!org) throw new Error(`Unknown organization: ${organizationId}`);
    const slug = normalizeOrganizationSlug(entry.slug);
    const error = getOrganizationSlugError(slug);
    if (error) throw new Error(`${organizationId}: ${error}`);
    if (org.slug !== null && org.slug !== slug) {
      throw new Error(`Refusing to replace existing slug for ${organizationId}.`);
    }
    const owner = owners.get(slug);
    if (owner && owner !== organizationId) throw new Error(`Slug is already assigned: ${slug}`);
    owners.set(slug, organizationId);
    if (org.slug === slug) skipped.push(organizationId);
    else changes.push({ organizationId, name: org.name, slug });
  }
  const changedIds = new Set(changes.map((change) => change.organizationId));
  const remaining = organizations.filter((org) => org.slug === null && !changedIds.has(org.id));
  return { changes, skipped, remaining };
}

// A narrow interface allows testing without connecting to a real database.
export interface BackfillClient {
  query(sql: string, values?: string[]): Promise<{
    rows: OrganizationRow[];
    rowCount: number | null;
  }>;
}

export async function backfillOrganizationSlugs(client: BackfillClient, mapping: unknown, apply = false) {
  if (apply) await client.query('BEGIN');
  try {
    // Re-read under a write lock when applying, so the validated plan cannot race
    // with company creation or another backfill. Keep this maintenance transaction short.
    if (apply) {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query('LOCK TABLE "Organization" IN SHARE ROW EXCLUSIVE MODE');
    }
    const { rows } = await client.query('SELECT "id", "name", "slug" FROM "Organization" ORDER BY "id"');
    const plan = planSlugBackfill(rows, mapping);
    if (apply) {
      for (const change of plan.changes) {
        const result = await client.query(
          'UPDATE "Organization" SET "slug" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2 AND "slug" IS NULL',
          [change.slug, change.organizationId],
        );
        if (result.rowCount !== 1) throw new Error(`Organization changed concurrently: ${change.organizationId}`);
      }
      await client.query('COMMIT');
    }
    return plan;
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  }
}
