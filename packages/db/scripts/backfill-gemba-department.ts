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

/**
 * Backfill for organizations created before every org was guaranteed a
 * "GembaPMS" platform-team department (see OrganizationsService.create()'s
 * addGembaTeam()). For each org missing a Department{isPlatformTeam: true},
 * creates one and adds every current SUPER_ADMIN user as an employee there.
 *
 * Safe to re-run: skips orgs that already have a platform-team department,
 * and skips individual (email, organizationId) collisions rather than
 * failing the whole run.
 *
 * Usage:
 *   npx tsx scripts/backfill-gemba-department.ts          # dry run, prints what would happen
 *   npx tsx scripts/backfill-gemba-department.ts --apply  # actually writes
 */

async function main() {
  const apply = process.argv.includes('--apply');

  const orgs = await prisma.organization.findMany({
    where: { departments: { none: { isPlatformTeam: true } } },
    select: { id: true, name: true, shortName: true },
  });

  if (orgs.length === 0) {
    console.log('Every organization already has a GembaPMS platform-team department. Nothing to do.');
    return;
  }

  const superAdmins = await prisma.userOrganization.findMany({
    where: { role: { name: 'SUPER_ADMIN' } },
    distinct: ['userId'],
    select: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  const users = superAdmins.map((m) => m.user);

  console.log(`Found ${orgs.length} organization(s) missing a GembaPMS department.`);
  console.log(`Will add ${users.length} SUPER_ADMIN user(s) to each: ${users.map((u) => u.name).join(', ')}`);

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to create the missing departments.');
    return;
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });

  for (const org of orgs) {
    const department = await prisma.department.create({
      data: { name: 'GembaPMS', organizationId: org.id, isPlatformTeam: true },
    });

    for (const user of users) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.userOrganization.upsert({
            where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
            create: { userId: user.id, organizationId: org.id, roleId: superAdminRole.id },
            update: { roleId: superAdminRole.id },
          });

          const [firstName, ...rest] = user.name.split(' ');
          await tx.employee.create({
            data: {
              firstName,
              lastName: rest.join(' ') || firstName,
              email: user.email,
              phone: user.phone,
              organizationId: org.id,
              userId: user.id,
              departmentId: department.id,
            },
          });
        });
        console.log(`  ${org.shortName || org.name}: added ${user.name}`);
      } catch (err: any) {
        if (err?.code === 'P2002') {
          console.log(`  ${org.shortName || org.name}: skipped ${user.name} (already an employee there)`);
        } else {
          throw err;
        }
      }
    }
  }

  console.log(`\nDone. Backfilled ${orgs.length} organization(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
