import { fileURLToPath } from 'url';
import * as path from 'path';

// Capture seed directory BEFORE Prisma import overwrites globalThis.__dirname
const seedDir = path.dirname(fileURLToPath(import.meta.url));

import { PrismaClient } from  'db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import csv from 'csv-parser';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Types matching your CSV
interface CsvRow {
  id: string;
  name: string;
  phone: string;
  department: string;
  job_position: string;
  role: string;
  is_active: string;
}

async function main() {
  console.log('🌱 Starting Database Seeding for Sunveat Food Limited...');

  // 1. Create the Base Organization
  const org = await prisma.organization.create({
    data: { name: 'Sunveat Food Limited' },
  });
  console.log(`✅ Created Organization: ${org.name}`);

  // 2. Read the CSV File
  const results: CsvRow[] = [];
  const csvFilePath = path.resolve(seedDir, './employees_rows.csv');

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`📊 Found ${results.length} rows in CSV.`);

  // 3. Extract and Create Unique Roles
  const uniqueRoles = [...new Set(results.map(r => r.role).filter(Boolean))];
  const roleMap = new Map<string, string>(); // Maps roleName -> roleId
  
  for (const roleName of uniqueRoles) {
    const role = await prisma.role.create({
      data: { name: roleName, organizationId: org.id }
    });
    roleMap.set(roleName, role.id);
  }
  console.log(`✅ Created Roles: ${uniqueRoles.join(', ')}`);

  // 4. Extract and Create Unique Departments
  const uniqueDepts = [...new Set(results.map(r => r.department).filter(Boolean))];
  const deptMap = new Map<string, string>(); // Maps deptName -> deptId
  
  for (const deptName of uniqueDepts) {
    const dept = await prisma.department.create({
      data: { name: deptName, organizationId: org.id }
    });
    deptMap.set(deptName, dept.id);
  }
  console.log(`✅ Created ${uniqueDepts.length} Departments`);

  // 5. Insert Users & Employees mapping
  let successCount = 0;
  let failCount = 0;
  
  // Track phones to prevent Prisma @unique constraint violations
  const seenPhones = new Set<string>();

  // We process sequentially to avoid overwhelming the AWS RDS free tier connection pool
  for (const row of results) {
    try {
      // Split Name into First & Last
      const nameParts = row.name ? row.name.trim().split(' ') : ['Unknown'];
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '-';
      
      // Ensure strict uniqueness for phone to satisfy Employee.phone @unique
      let safePhone = row.phone ? row.phone.trim() : `no-phone-${row.id}`;
      if (seenPhones.has(safePhone)) {
        safePhone = `${safePhone}-${row.id.substring(0, 4)}`; // Append part of ID if duplicate
      }
      seenPhones.add(safePhone);

      // Generate a perfectly unique email based on their CSV ID to satisfy Employee.email @unique
      const dummyEmail = `${row.id}@sunveat.local`; 

      const roleId = roleMap.get(row.role) ?? roleMap.values().next().value!;
      const departmentId = row.department ? deptMap.get(row.department) : null;

      // Create User
      const user = await prisma.user.create({
        data: {
          id: row.id, // Using the ID from the CSV
          name: row.name || 'Unknown',
          phone: safePhone,
          roleId: roleId,
          organizationId: org.id,
          email: dummyEmail, // Optional in User, but good to link
        }
      });

      // Create Linked Employee
      await prisma.employee.create({
        data: {
          firstName,
          lastName,
          email: dummyEmail, // Required and @unique in Employee
          phone: safePhone,  // Optional but @unique in Employee
          organizationId: org.id,
          departmentId: departmentId,
          userId: user.id, // Link to the user
        }
      });

      successCount++;
    } catch (error: any) {
      console.error(`❌ Failed to insert row for ${row.name}:`, error.message);
      failCount++;
    }
  }

  console.log(`\n🎉 Seeding complete!`);
  console.log(`✅ Successfully imported: ${successCount}`);
  if (failCount > 0) console.log(`❌ Failed imports: ${failCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });