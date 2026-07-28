import 'dotenv/config';
import { PrismaClient } from 'db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const displayOrgName = (org: { name: string; shortName: string | null }) => org.shortName || org.name;

/**
 * Backfill for VisitRequest rows approved before calendar.service.ts's
 * respondToRequest() started converting an approval into a real
 * ConsultancyVisit (and linking it via visitId). Those older rows stay
 * APPROVED with visitId = null forever, so getAgenda() keeps showing them
 * under "Visit Requests" instead of "Scheduled Partner Visits".
 *
 * There's no audit trail of who clicked Approve on these older rows, so the
 * backfilled visit's createdById falls back to the request's own
 * createdById (the requesting org's user). Edit FALLBACK_CREATED_BY_USER_ID
 * below if you'd rather attribute these to a specific admin-org user.
 *
 * Safe to re-run: only touches requests with status APPROVED and
 * visitId null, and links the new visit immediately, so nothing is left
 * for a second run to pick up.
 *
 * Usage:
 *   npx tsx scripts/backfill-approved-visit-requests.ts          # dry run, prints what would happen
 *   npx tsx scripts/backfill-approved-visit-requests.ts --apply  # actually writes
 */

const FALLBACK_CREATED_BY_USER_ID: string | null = null; // set a User id to override the fallback above

async function main() {
  const apply = process.argv.includes('--apply');

  const orphaned = await prisma.visitRequest.findMany({
    where: { status: 'APPROVED', visitId: null },
    include: { organization: { select: { name: true, shortName: true } } },
    orderBy: { requestedDate: 'asc' },
  });

  if (orphaned.length === 0) {
    console.log('No orphaned approved requests found. Nothing to do.');
    return;
  }

  console.log(`Found ${orphaned.length} approved request(s) with no linked visit:`);
  for (const req of orphaned) {
    const dateStr = req.requestedDate.toISOString().split('T')[0];
    console.log(`  - ${displayOrgName(req.organization)} — ${dateStr} (request ${req.id})`);
  }

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to create the missing visits.');
    return;
  }

  for (const req of orphaned) {
    const visit = await prisma.consultancyVisit.create({
      data: {
        title: `${displayOrgName(req.organization)} — Requested Visit`,
        clientOrgId: req.organizationId,
        date: req.requestedDate,
        startTime: req.preferredTime || undefined,
        status: 'CONFIRMED',
        notes: req.message || undefined,
        createdById: FALLBACK_CREATED_BY_USER_ID ?? req.createdById,
      },
      select: { id: true },
    });

    await prisma.visitRequest.update({
      where: { id: req.id },
      data: { visitId: visit.id },
    });

    console.log(`Converted request ${req.id} -> visit ${visit.id}`);
  }

  console.log(`\nDone. Converted ${orphaned.length} request(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
