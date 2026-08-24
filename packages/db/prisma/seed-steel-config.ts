import 'dotenv/config';
import { PrismaClient, ProductType, PlantRoute, SteelDepartment } from 'db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Steel Configuration starter master data for a fictional long-products
 * steel manufacturer — Products, Product Specifications, Production Routes
 * (+ ordered steps), Materials, Customers, and Dealers.
 *
 * Idempotent: every record is upserted on its unique
 * (organizationId, code) — or (organizationId, name) for Customer — so
 * re-running this script never duplicates data.
 *
 * Run: cd packages/db && npx tsx prisma/seed-steel-config.ts
 */

// ProductType only has TMT_BAR, BILLET, WIRE_ROD, SECTION, OTHER — the exec
// prompt's MERCHANT_BAR category (angles/channels/flats) has no dedicated
// enum value, so those products map to SECTION (closest existing meaning:
// rolled structural/merchant sections) rather than inventing a new enum
// value. Reported explicitly in the delivery summary.
const PRODUCTS: { code: string; name: string; productType: ProductType }[] = [
  { code: 'TMT-001', name: 'TMT Reinforcement Bar', productType: ProductType.TMT_BAR },
  { code: 'WR-001', name: 'Wire Rod', productType: ProductType.WIRE_ROD },
  { code: 'MB-001', name: 'Merchant Bar', productType: ProductType.SECTION },
  { code: 'ANG-001', name: 'Steel Angle', productType: ProductType.SECTION },
  { code: 'CH-001', name: 'Steel Channel', productType: ProductType.SECTION },
  { code: 'FL-001', name: 'Flat Bar', productType: ProductType.SECTION },
];

const TMT_SIZES = ['8', '10', '12', '16', '20', '25', '32'];

const SPECIFICATIONS: {
  productCode: string;
  code: string;
  grade: string;
  size: string;
  standard: string;
  length?: string;
}[] = [
  ...TMT_SIZES.map((mm) => ({
    productCode: 'TMT-001',
    code: `TMT-${mm.padStart(2, '0')}`,
    grade: 'Grade 500',
    size: `${mm} mm`,
    standard: 'BS 4449',
    length: '12 m',
  })),
  // A small Grade 300 line, same sizes/standard family, per exec prompt §14.
  { productCode: 'TMT-001', code: 'TMT-12-G300', grade: 'Grade 300', size: '12 mm', standard: 'BS 4449', length: '12 m' },
  { productCode: 'TMT-001', code: 'TMT-16-G300', grade: 'Grade 300', size: '16 mm', standard: 'BS 4449', length: '12 m' },

  { productCode: 'WR-001', code: 'WR-5.5', grade: 'Low Carbon', size: '5.5 mm', standard: 'IS 7887' },
  { productCode: 'WR-001', code: 'WR-6.5', grade: 'Low Carbon', size: '6.5 mm', standard: 'IS 7887' },
  { productCode: 'WR-001', code: 'WR-8.0', grade: 'Low Carbon', size: '8 mm', standard: 'IS 7887' },

  { productCode: 'ANG-001', code: 'ANG-25X25X3', grade: 'Mild Steel', size: '25 x 25 x 3 mm', standard: 'IS 808' },
  { productCode: 'ANG-001', code: 'ANG-40X40X5', grade: 'Mild Steel', size: '40 x 40 x 5 mm', standard: 'IS 808' },
  { productCode: 'ANG-001', code: 'ANG-50X50X5', grade: 'Mild Steel', size: '50 x 50 x 5 mm', standard: 'IS 808' },

  { productCode: 'FL-001', code: 'FL-25X5', grade: 'Mild Steel', size: '25 x 5 mm', standard: 'IS 1730' },
  { productCode: 'FL-001', code: 'FL-40X6', grade: 'Mild Steel', size: '40 x 6 mm', standard: 'IS 1730' },

  { productCode: 'CH-001', code: 'CH-75', grade: 'Mild Steel', size: '75 mm', standard: 'IS 808' },
  { productCode: 'CH-001', code: 'CH-100', grade: 'Mild Steel', size: '100 mm', standard: 'IS 808' },
];

const ROUTES: {
  code: string;
  name: string;
  plantRoute: PlantRoute;
  steps: { processName: string; department: SteelDepartment }[];
}[] = [
  {
    code: 'RT-TMT-STD',
    name: 'TMT Route — Standard',
    plantRoute: PlantRoute.INTEGRATED_PLANT,
    steps: [
      { processName: 'Melting', department: SteelDepartment.FURNACE },
      { processName: 'Continuous Casting', department: SteelDepartment.CCM },
      { processName: 'Reheating', department: SteelDepartment.FURNACE },
      { processName: 'Rolling', department: SteelDepartment.ROLLING },
      { processName: 'Cooling', department: SteelDepartment.ROLLING },
      { processName: 'Cutting & Bundling', department: SteelDepartment.DISPATCH },
      { processName: 'Finished Goods', department: SteelDepartment.DISPATCH },
    ],
  },
  {
    code: 'RT-WR-STD',
    name: 'Wire Rod Route',
    plantRoute: PlantRoute.INTEGRATED_PLANT,
    steps: [
      { processName: 'Melting', department: SteelDepartment.FURNACE },
      { processName: 'Continuous Casting', department: SteelDepartment.CCM },
      { processName: 'Reheating', department: SteelDepartment.FURNACE },
      { processName: 'Wire Rod Rolling', department: SteelDepartment.ROLLING },
      { processName: 'Cooling', department: SteelDepartment.ROLLING },
      { processName: 'Coiling', department: SteelDepartment.DISPATCH },
      { processName: 'Finished Goods', department: SteelDepartment.DISPATCH },
    ],
  },
  {
    code: 'RT-MB-STD',
    name: 'Merchant Bar Route',
    plantRoute: PlantRoute.INTEGRATED_PLANT,
    steps: [
      { processName: 'Melting', department: SteelDepartment.FURNACE },
      { processName: 'Continuous Casting', department: SteelDepartment.CCM },
      { processName: 'Reheating', department: SteelDepartment.FURNACE },
      { processName: 'Section Rolling', department: SteelDepartment.ROLLING },
      { processName: 'Cutting', department: SteelDepartment.DISPATCH },
      { processName: 'Bundling', department: SteelDepartment.DISPATCH },
      { processName: 'Finished Goods', department: SteelDepartment.DISPATCH },
    ],
  },
];

const MATERIALS: { code: string; name: string; unit: string }[] = [
  { code: 'MAT-SCRAP', name: 'Steel Scrap', unit: 'MT' },
  { code: 'MAT-DRI', name: 'DRI', unit: 'MT' },
  { code: 'MAT-PIGIRON', name: 'Pig Iron', unit: 'MT' },
  { code: 'MAT-FEMN', name: 'Ferro Manganese', unit: 'MT' },
  { code: 'MAT-FESI', name: 'Ferro Silicon', unit: 'MT' },
  { code: 'MAT-ALUM', name: 'Aluminium', unit: 'KG' },
  { code: 'MAT-ELECTRODE', name: 'Graphite Electrodes', unit: 'NOS' },
  { code: 'MAT-LIME', name: 'Lime', unit: 'MT' },
  { code: 'MAT-DOLOMITE', name: 'Dolomite', unit: 'MT' },
];

const CUSTOMERS: { name: string; defaultDeliveryLocation?: string }[] = [
  { name: 'Eastland Construction Ltd', defaultDeliveryLocation: 'Eastland Site Yard, Plot 14' },
  { name: 'Metro Infrastructure Ltd', defaultDeliveryLocation: 'Metro Central Depot' },
  { name: 'Horizon Engineering Ltd', defaultDeliveryLocation: 'Horizon Works, Bay 3' },
  { name: 'Rift Valley Contractors Ltd', defaultDeliveryLocation: 'Rift Valley Regional Store' },
];

const DEALERS: { name: string; code: string; region?: string }[] = [
  { name: 'Nairobi Steel Distributors', code: 'DLR-NBI', region: 'Nairobi' },
  { name: 'Central Metals Depot', code: 'DLR-CTL', region: 'Central' },
  { name: 'Western Steel Supplies', code: 'DLR-WST', region: 'Western' },
  { name: 'Coastal Building Materials', code: 'DLR-CST', region: 'Coast' },
];

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: 'Gemba PMS' } });
  if (!org) {
    throw new Error('Organization "Gemba PMS" not found — refusing to seed against an unknown org.');
  }
  if (!org.modules.includes('STEEL')) {
    throw new Error('Gemba PMS does not have the STEEL module enabled — aborting.');
  }
  console.log(`Seeding Steel Configuration master data into org "${org.name}" (${org.id})`);

  const productIdByCode = new Map<string, string>();
  for (const p of PRODUCTS) {
    const product = await prisma.steelProduct.upsert({
      where: { organizationId_code: { organizationId: org.id, code: p.code } },
      update: { name: p.name, productType: p.productType },
      create: { organizationId: org.id, code: p.code, name: p.name, productType: p.productType },
    });
    productIdByCode.set(p.code, product.id);
  }
  console.log(`Products: ${PRODUCTS.length} upserted.`);

  for (const s of SPECIFICATIONS) {
    const productId = productIdByCode.get(s.productCode);
    if (!productId) {
      console.warn(`Skipping spec ${s.code} — unknown productCode ${s.productCode}`);
      continue;
    }
    await prisma.steelProductSpecification.upsert({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
      update: { productId, grade: s.grade, size: s.size, standard: s.standard, length: s.length ?? null },
      create: {
        organizationId: org.id,
        productId,
        code: s.code,
        grade: s.grade,
        size: s.size,
        standard: s.standard,
        length: s.length ?? null,
      },
    });
  }
  console.log(`Product Specifications: ${SPECIFICATIONS.length} upserted.`);

  for (const r of ROUTES) {
    const route = await prisma.steelProductionRoute.upsert({
      where: { organizationId_code: { organizationId: org.id, code: r.code } },
      update: { name: r.name, plantRoute: r.plantRoute },
      create: { organizationId: org.id, code: r.code, name: r.name, plantRoute: r.plantRoute },
    });
    const existingSteps = await prisma.steelProductionRouteStep.count({ where: { routeId: route.id } });
    if (existingSteps === 0) {
      for (let i = 0; i < r.steps.length; i++) {
        await prisma.steelProductionRouteStep.create({
          data: { routeId: route.id, sequence: i + 1, processName: r.steps[i].processName, department: r.steps[i].department },
        });
      }
    }
  }
  console.log(`Production Routes: ${ROUTES.length} upserted (steps seeded only if a route had none).`);

  for (const m of MATERIALS) {
    await prisma.steelMaterialMaster.upsert({
      where: { organizationId_code: { organizationId: org.id, code: m.code } },
      update: { name: m.name, unit: m.unit },
      create: { organizationId: org.id, code: m.code, name: m.name, unit: m.unit },
    });
  }
  console.log(`Materials: ${MATERIALS.length} upserted.`);

  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { organizationId_name: { organizationId: org.id, name: c.name } },
      update: { defaultDeliveryLocation: c.defaultDeliveryLocation },
      create: { organizationId: org.id, name: c.name, defaultDeliveryLocation: c.defaultDeliveryLocation },
    });
  }
  console.log(`Customers: ${CUSTOMERS.length} upserted.`);

  for (const d of DEALERS) {
    await prisma.dealer.upsert({
      where: { organizationId_code: { organizationId: org.id, code: d.code } },
      update: { name: d.name, region: d.region },
      create: { organizationId: org.id, name: d.name, code: d.code, region: d.region },
    });
  }
  console.log(`Dealers: ${DEALERS.length} upserted.`);

  console.log('Steel Configuration starter data seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
