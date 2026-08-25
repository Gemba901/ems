import 'dotenv/config';
import {
  PrismaClient,
  ProductType,
  PlantRoute,
  SteelDepartment,
  SteelMaterialType,
  SteelProcurementType,
  SupplierApprovalStatus,
  SteelLookupType,
} from 'db';
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

// materialType is required for P02-A02 material classification to work at
// all (see the S1 Requirement material-confirmation fix) — every starter
// material is pre-classified so a new org can use P02 without first visiting
// Configuration. frequentlySourced marks the everyday melting-shop inputs
// that P02-A02 should default to.
const MATERIALS: {
  code: string;
  name: string;
  unit: string;
  category: string;
  materialType: SteelMaterialType;
  procurementType: SteelProcurementType;
  frequentlySourced: boolean;
  specificationReference?: string;
  requiredDocuments?: string[];
}[] = [
  { code: 'MAT-SCRAP', name: 'Steel Scrap', unit: 'MT', category: 'Ferrous Input', materialType: SteelMaterialType.SCRAP, procurementType: SteelProcurementType.LOCAL, frequentlySourced: true, requiredDocuments: ['Weighbridge Slip'] },
  { code: 'MAT-DRI', name: 'DRI', unit: 'MT', category: 'Ferrous Input', materialType: SteelMaterialType.DRI, procurementType: SteelProcurementType.LOCAL, frequentlySourced: true, specificationReference: 'IS 15774', requiredDocuments: ['Quality Certificate'] },
  { code: 'MAT-PIGIRON', name: 'Pig Iron', unit: 'MT', category: 'Ferrous Input', materialType: SteelMaterialType.OTHER, procurementType: SteelProcurementType.BOTH, frequentlySourced: false },
  { code: 'MAT-FEMN', name: 'Ferro Manganese', unit: 'MT', category: 'Alloy', materialType: SteelMaterialType.ALLOY, procurementType: SteelProcurementType.IMPORT, frequentlySourced: false, requiredDocuments: ['Mill Test Certificate'] },
  { code: 'MAT-FESI', name: 'Ferro Silicon', unit: 'MT', category: 'Alloy', materialType: SteelMaterialType.ALLOY, procurementType: SteelProcurementType.IMPORT, frequentlySourced: false, requiredDocuments: ['Mill Test Certificate'] },
  { code: 'MAT-ALUM', name: 'Aluminium', unit: 'KG', category: 'Alloy', materialType: SteelMaterialType.ALLOY, procurementType: SteelProcurementType.BOTH, frequentlySourced: false },
  { code: 'MAT-ELECTRODE', name: 'Graphite Electrodes', unit: 'NOS', category: 'Consumable', materialType: SteelMaterialType.OTHER, procurementType: SteelProcurementType.IMPORT, frequentlySourced: false, requiredDocuments: ['Test Certificate'] },
  { code: 'MAT-LIME', name: 'Lime', unit: 'MT', category: 'Flux/Additive', materialType: SteelMaterialType.ADDITIVE, procurementType: SteelProcurementType.LOCAL, frequentlySourced: true, requiredDocuments: ['Chemical Analysis Report'] },
  { code: 'MAT-DOLOMITE', name: 'Dolomite', unit: 'MT', category: 'Refractory', materialType: SteelMaterialType.REFRACTORY, procurementType: SteelProcurementType.LOCAL, frequentlySourced: false },
];

// Demo/test suppliers — no authoritative supplier data exists anywhere in the
// project (inspected: no supplier seed, no supplier records referenced by any
// fixture), so these are clearly-labeled placeholders for exercising P02
// end-to-end, not real company suppliers. qualityScore/deliveryScore are demo
// values so S3's QCD comparison has real numbers to weight, not just price.
const SUPPLIERS: {
  code: string;
  name: string;
  materialTypes: SteelMaterialType[];
  country: string;
  isImportSource: boolean;
  approvalStatus: SupplierApprovalStatus;
  qualityScore: number;
  deliveryScore: number;
}[] = [
  { code: 'DEMO-SUP-A', name: 'Demo Supplier A — Local Scrap & DRI', materialTypes: [SteelMaterialType.SCRAP, SteelMaterialType.DRI], country: 'Kenya', isImportSource: false, approvalStatus: SupplierApprovalStatus.APPROVED, qualityScore: 82, deliveryScore: 78 },
  { code: 'DEMO-SUP-B', name: 'Demo Supplier B — Regional Ferro Alloys', materialTypes: [SteelMaterialType.ALLOY], country: 'India', isImportSource: true, approvalStatus: SupplierApprovalStatus.APPROVED, qualityScore: 90, deliveryScore: 70 },
  { code: 'DEMO-SUP-C', name: 'Demo Supplier C — Additives & Refractories', materialTypes: [SteelMaterialType.ADDITIVE, SteelMaterialType.REFRACTORY], country: 'Kenya', isImportSource: false, approvalStatus: SupplierApprovalStatus.APPROVED, qualityScore: 75, deliveryScore: 85 },
  { code: 'DEMO-SUP-D', name: 'Demo Supplier D — General Import Trading', materialTypes: [SteelMaterialType.SCRAP, SteelMaterialType.ALLOY, SteelMaterialType.OTHER], country: 'United Arab Emirates', isImportSource: true, approvalStatus: SupplierApprovalStatus.PENDING, qualityScore: 60, deliveryScore: 60 },
];

// Supplier -> Material codes eligible to supply. MAT-SCRAP has two eligible
// suppliers (A, D) to exercise S3's multi-supplier comparison; DEMO-SUP-B and
// DEMO-SUP-D each supply multiple materials to exercise the reverse case.
const SUPPLIER_MATERIAL_LINKS: { supplierCode: string; materialCode: string }[] = [
  { supplierCode: 'DEMO-SUP-A', materialCode: 'MAT-SCRAP' },
  { supplierCode: 'DEMO-SUP-A', materialCode: 'MAT-DRI' },
  { supplierCode: 'DEMO-SUP-D', materialCode: 'MAT-SCRAP' },
  { supplierCode: 'DEMO-SUP-D', materialCode: 'MAT-FEMN' },
  { supplierCode: 'DEMO-SUP-D', materialCode: 'MAT-ELECTRODE' },
  { supplierCode: 'DEMO-SUP-B', materialCode: 'MAT-FEMN' },
  { supplierCode: 'DEMO-SUP-B', materialCode: 'MAT-FESI' },
  { supplierCode: 'DEMO-SUP-B', materialCode: 'MAT-ALUM' },
  { supplierCode: 'DEMO-SUP-C', materialCode: 'MAT-LIME' },
  { supplierCode: 'DEMO-SUP-C', materialCode: 'MAT-DOLOMITE' },
];

// Weights sum to 1.0 (0.3 quality / 0.5 cost / 0.2 delivery) — a cost-led
// default typical of commodity raw-material procurement. Not enforced by the
// backend (CreateQcdCriteriaDto only requires non-negative numbers), but kept
// normalized here as sensible starter data an admin can adjust in
// Configuration → QCD Criteria.
const QCD_CRITERIA = { name: 'Standard QCD', qualityWeight: 0.3, costWeight: 0.5, deliveryWeight: 0.2 };

const LOOKUPS: { type: SteelLookupType; code: string; name: string }[] = [
  { type: SteelLookupType.PAYMENT_TERMS, code: 'NET30', name: 'Net 30 Days' },
  { type: SteelLookupType.PAYMENT_TERMS, code: 'NET45', name: 'Net 45 Days' },
  { type: SteelLookupType.PAYMENT_TERMS, code: 'ADVANCE', name: '100% Advance' },
  { type: SteelLookupType.INCOTERM, code: 'FOB', name: 'Free On Board' },
  { type: SteelLookupType.INCOTERM, code: 'CIF', name: 'Cost, Insurance & Freight' },
  { type: SteelLookupType.INCOTERM, code: 'EXW', name: 'Ex Works' },
  { type: SteelLookupType.CURRENCY, code: 'USD', name: 'US Dollar' },
  { type: SteelLookupType.CURRENCY, code: 'KES', name: 'Kenyan Shilling' },
  { type: SteelLookupType.TRANSPORT_MODE, code: 'ROAD', name: 'Road Transport' },
  { type: SteelLookupType.TRANSPORT_MODE, code: 'RAIL', name: 'Rail Transport' },
  { type: SteelLookupType.TRANSPORT_MODE, code: 'SEA', name: 'Sea Freight' },
  { type: SteelLookupType.DELIVERY_LOCATION, code: 'PLANT-GATE', name: 'Plant Gate' },
  { type: SteelLookupType.DELIVERY_LOCATION, code: 'PORT-MSA', name: 'Mombasa Port' },
  { type: SteelLookupType.DOCUMENT_TYPE, code: 'MTC', name: 'Mill Test Certificate' },
  { type: SteelLookupType.DOCUMENT_TYPE, code: 'COO', name: 'Certificate of Origin' },
  { type: SteelLookupType.DOCUMENT_TYPE, code: 'PKG-LIST', name: 'Packing List' },
  { type: SteelLookupType.DOCUMENT_TYPE, code: 'WEIGH-SLIP', name: 'Weighbridge Slip' },
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

  const materialIdByCode = new Map<string, string>();
  for (const m of MATERIALS) {
    const material = await prisma.steelMaterialMaster.upsert({
      where: { organizationId_code: { organizationId: org.id, code: m.code } },
      update: {
        name: m.name,
        unit: m.unit,
        category: m.category,
        materialType: m.materialType,
        procurementType: m.procurementType,
        frequentlySourced: m.frequentlySourced,
        specificationReference: m.specificationReference ?? null,
        requiredDocuments: m.requiredDocuments ?? [],
      },
      create: {
        organizationId: org.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        category: m.category,
        materialType: m.materialType,
        procurementType: m.procurementType,
        frequentlySourced: m.frequentlySourced,
        specificationReference: m.specificationReference ?? null,
        requiredDocuments: m.requiredDocuments ?? [],
      },
    });
    materialIdByCode.set(m.code, material.id);
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

  const supplierIdByCode = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where: { organizationId_code: { organizationId: org.id, code: s.code } },
      update: {
        name: s.name,
        materialTypes: s.materialTypes,
        country: s.country,
        isImportSource: s.isImportSource,
        approvalStatus: s.approvalStatus,
        qualityScore: s.qualityScore,
        deliveryScore: s.deliveryScore,
      },
      create: {
        organizationId: org.id,
        code: s.code,
        name: s.name,
        materialTypes: s.materialTypes,
        country: s.country,
        isImportSource: s.isImportSource,
        approvalStatus: s.approvalStatus,
        qualityScore: s.qualityScore,
        deliveryScore: s.deliveryScore,
      },
    });
    supplierIdByCode.set(s.code, supplier.id);
  }
  console.log(`Suppliers (demo/test): ${SUPPLIERS.length} upserted.`);

  let eligibilityCount = 0;
  for (const link of SUPPLIER_MATERIAL_LINKS) {
    const supplierId = supplierIdByCode.get(link.supplierCode);
    const materialId = materialIdByCode.get(link.materialCode);
    if (!supplierId || !materialId) {
      console.warn(`Skipping eligibility link ${link.supplierCode} -> ${link.materialCode} — unknown code`);
      continue;
    }
    await prisma.steelSupplierMaterial.upsert({
      where: { supplierId_materialId: { supplierId, materialId } },
      update: { isEligible: true, isActive: true },
      create: { organizationId: org.id, supplierId, materialId, isEligible: true },
    });
    eligibilityCount++;
  }
  console.log(`Supplier-Material eligibility links: ${eligibilityCount} upserted.`);

  const existingActiveQcd = await prisma.steelQcdCriteria.findFirst({
    where: { organizationId: org.id, isActive: true },
  });
  if (existingActiveQcd) {
    console.log(`QCD criteria: active criteria "${existingActiveQcd.name}" already exists — skipped.`);
  } else {
    await prisma.steelQcdCriteria.upsert({
      where: { organizationId_name: { organizationId: org.id, name: QCD_CRITERIA.name } },
      update: {
        qualityWeight: QCD_CRITERIA.qualityWeight,
        costWeight: QCD_CRITERIA.costWeight,
        deliveryWeight: QCD_CRITERIA.deliveryWeight,
        isActive: true,
      },
      create: { organizationId: org.id, ...QCD_CRITERIA },
    });
    console.log(`QCD criteria: "${QCD_CRITERIA.name}" upserted.`);
  }

  for (const l of LOOKUPS) {
    await prisma.steelLookup.upsert({
      where: { organizationId_type_code: { organizationId: org.id, type: l.type, code: l.code } },
      update: { name: l.name },
      create: { organizationId: org.id, type: l.type, code: l.code, name: l.name },
    });
  }
  console.log(`Procurement lookups: ${LOOKUPS.length} upserted.`);

  console.log('Steel Configuration starter data seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
