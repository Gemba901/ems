import 'dotenv/config';
import { PrismaClient, HeatChargeMaterialCategory, HeatCycleEventType } from 'db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * P05 Melting dashboard demo-data seed.
 *
 * Populates the P05 Furnace/Heat-Cycle dashboard with realistic-looking
 * furnaces, linings, completed + active heats, material charges, and
 * heat-cycle events, so the dashboard can be visually inspected in a
 * non-empty state.
 *
 * Idempotent: every record it creates has a deterministic identifier
 * ("...-DEMO-..." furnace codes, "...-90xxx" prep/charge/heat numbers).
 * Before writing anything for a given heat, it checks whether that heat's
 * SteelMelting row already exists and skips the whole heat (charge prep +
 * melting + charges + events) if so. Re-running this script is therefore
 * safe and produces no duplicates.
 *
 * Does NOT touch any other data: no deletes, no resets, no changes to
 * unrelated tables. Reuses the existing "Gemba PMS" organization, its
 * existing employees, and its existing SteelProductionPlan records (created
 * by earlier P01 work) rather than inventing a parallel demo org.
 *
 * Run: cd packages/db && npx prisma db seed
 *   (or directly: npx tsx prisma/seed.ts)
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: 'Gemba PMS' } });
  if (!org) {
    throw new Error(
      'Organization "Gemba PMS" not found — refusing to seed against an unknown org.',
    );
  }
  if (!org.modules.includes('STEEL')) {
    throw new Error('Gemba PMS does not have the STEEL module enabled — aborting.');
  }
  console.log(`Seeding P05 demo data into org "${org.name}" (${org.id})`);

  const employees = await prisma.employee.findMany({
    where: { organizationId: org.id },
    select: { id: true, firstName: true, lastName: true },
    take: 6,
    orderBy: { id: 'asc' },
  });
  if (employees.length === 0) {
    throw new Error('Gemba PMS has no employees — cannot attribute seeded records.');
  }
  const operator = (i: number) => pick(employees, i).id;

  const plans = await prisma.steelProductionPlan.findMany({
    where: { organizationId: org.id },
    select: { id: true, planNumber: true, grade: true },
    orderBy: { planNumber: 'asc' },
  });
  if (plans.length === 0) {
    throw new Error(
      'Gemba PMS has no SteelProductionPlan records — cannot create charge preparations without a parent plan.',
    );
  }
  console.log(`Reusing ${plans.length} existing production plan(s) and ${employees.length} employee(s).`);

  // ── Furnaces (3, distinct real enum statuses) ──
  const furnaceSpecs = [
    { code: 'DEMO-F1', name: 'Furnace 1', status: 'READY' as const },
    { code: 'DEMO-F2', name: 'Furnace 2', status: 'READY' as const },
    { code: 'DEMO-F3', name: 'Furnace 3', status: 'MAINTENANCE' as const },
  ];
  const furnaces: Awaited<ReturnType<typeof prisma.furnace.upsert>>[] = [];
  for (const spec of furnaceSpecs) {
    const furnace = await prisma.furnace.upsert({
      where: { organizationId_code: { organizationId: org.id, code: spec.code } },
      update: {},
      create: { organizationId: org.id, code: spec.code, name: spec.name, status: spec.status },
    });
    furnaces.push(furnace);
  }
  console.log(`Furnaces ready: ${furnaces.map((f) => `${f.code} (${f.status})`).join(', ')}`);

  // ── Linings (one ACTIVE lining per furnace; reuse if already seeded) ──
  const liningSpecs = [
    { installedDaysAgo: 24, heatsCompleted: 6, condition: 'Good — no visible cracks', thicknessRemainingMm: 68 },
    { installedDaysAgo: 40, heatsCompleted: 5, condition: 'Good', thicknessRemainingMm: 58 },
    { installedDaysAgo: 95, heatsCompleted: 2, condition: 'Worn — thin patches near tap hole, inspect before next campaign', thicknessRemainingMm: 11 },
  ];
  const linings: Awaited<ReturnType<typeof prisma.furnaceLining.create>>[] = [];
  for (let i = 0; i < furnaces.length; i++) {
    const furnace = furnaces[i];
    let lining = await prisma.furnaceLining.findFirst({
      where: { furnaceId: furnace.id, status: 'ACTIVE' },
    });
    if (!lining) {
      const spec = liningSpecs[i];
      lining = await prisma.furnaceLining.create({
        data: {
          organizationId: org.id,
          furnaceId: furnace.id,
          installedAt: new Date(Date.now() - spec.installedDaysAgo * 86400000),
          material: 'MgO-C brick',
          heatsCompleted: 0, // incremented below as we attach completed heats
          condition: spec.condition,
          thicknessRemainingMm: spec.thicknessRemainingMm,
          inspectionNotes: i === 2 ? 'CHECK — recommend inspection before next campaign' : 'Routine visual check, no issues found',
        },
      });
    }
    linings.push(lining);
  }
  console.log(`Linings ready: ${linings.map((l) => `${l.id.slice(0, 8)} (${l.condition})`).join(', ')}`);

  // ── Heat specs: 13 completed (spread Today/7D/30D) + 2 active ──
  interface HeatSpec {
    heatNumber: string; // deterministic suffix
    furnaceIdx: number;
    daysAgo: number; // for completed: when it was handed over; for active: when it started
    cycleHours: number;
    inputTonnes: number;
    yieldFraction: number; // output = input * yieldFraction
    peakTempC: number;
    active?: boolean;
    activeStage?: 'A06_LOAD_CHARGE' | 'A07_START_MELTING' | 'A08_MONITOR_POWER' | 'A09_MONITOR_TEMPERATURE';
  }

  const completedSpecs: HeatSpec[] = [
    // Today (3)
    { heatNumber: '90001', furnaceIdx: 0, daysAgo: 0.25, cycleHours: 2.1, inputTonnes: 10.4, yieldFraction: 0.94, peakTempC: 1620 },
    { heatNumber: '90002', furnaceIdx: 1, daysAgo: 0.15, cycleHours: 2.4, inputTonnes: 11.0, yieldFraction: 0.91, peakTempC: 1610 },
    { heatNumber: '90003', furnaceIdx: 0, daysAgo: 0.05, cycleHours: 1.9, inputTonnes: 9.8, yieldFraction: 0.96, peakTempC: 1635 },
    // Within 7 days, not today (5)
    { heatNumber: '90004', furnaceIdx: 1, daysAgo: 1.5, cycleHours: 2.2, inputTonnes: 10.6, yieldFraction: 0.93, peakTempC: 1615 },
    { heatNumber: '90005', furnaceIdx: 0, daysAgo: 2.3, cycleHours: 2.6, inputTonnes: 11.2, yieldFraction: 0.89, peakTempC: 1590 },
    { heatNumber: '90006', furnaceIdx: 2, daysAgo: 3.1, cycleHours: 2.8, inputTonnes: 10.1, yieldFraction: 0.87, peakTempC: 1580 },
    { heatNumber: '90007', furnaceIdx: 1, daysAgo: 4.4, cycleHours: 2.0, inputTonnes: 9.6, yieldFraction: 0.95, peakTempC: 1625 },
    { heatNumber: '90008', furnaceIdx: 0, daysAgo: 5.8, cycleHours: 2.3, inputTonnes: 10.9, yieldFraction: 0.92, peakTempC: 1605 },
    // Within 30 days, not within 7 days (5)
    { heatNumber: '90009', furnaceIdx: 1, daysAgo: 9.2, cycleHours: 2.5, inputTonnes: 10.7, yieldFraction: 0.90, peakTempC: 1600 },
    { heatNumber: '90010', furnaceIdx: 0, daysAgo: 13.0, cycleHours: 2.1, inputTonnes: 10.3, yieldFraction: 0.94, peakTempC: 1618 },
    { heatNumber: '90011', furnaceIdx: 2, daysAgo: 17.5, cycleHours: 3.0, inputTonnes: 10.0, yieldFraction: 0.85, peakTempC: 1570 },
    { heatNumber: '90012', furnaceIdx: 1, daysAgo: 22.0, cycleHours: 2.2, inputTonnes: 11.1, yieldFraction: 0.93, peakTempC: 1612 },
    { heatNumber: '90013', furnaceIdx: 0, daysAgo: 27.5, cycleHours: 2.0, inputTonnes: 9.9, yieldFraction: 0.96, peakTempC: 1630 },
  ];

  const activeSpecs: HeatSpec[] = [
    { heatNumber: '90014', furnaceIdx: 0, daysAgo: 0, cycleHours: 0, inputTonnes: 10.5, yieldFraction: 0, peakTempC: 1420, active: true, activeStage: 'A08_MONITOR_POWER' },
    { heatNumber: '90015', furnaceIdx: 1, daysAgo: 0, cycleHours: 0, inputTonnes: 9.7, yieldFraction: 0, peakTempC: 1280, active: true, activeStage: 'A06_LOAD_CHARGE' },
  ];

  const MATERIAL_ROWS: { material: string; category: HeatChargeMaterialCategory; shareOfInput: number; unit: string }[] = [
    { material: 'HMS 1&2 Scrap', category: HeatChargeMaterialCategory.SCRAP, shareOfInput: 0.68, unit: 'MT' },
    { material: 'Sponge Iron (DRI)', category: HeatChargeMaterialCategory.RAW_METAL, shareOfInput: 0.20, unit: 'MT' },
    { material: 'FeSi (Ferro Silicon)', category: HeatChargeMaterialCategory.ALLOY, shareOfInput: 0.07, unit: 'MT' },
    { material: 'Lime', category: HeatChargeMaterialCategory.ADDITIVE, shareOfInput: 0.05, unit: 'MT' },
  ];

  let createdHeats = 0;
  let skippedHeats = 0;

  async function seedHeat(spec: HeatSpec, index: number) {
    const heatInProcessNumber = `HP-2026-${spec.heatNumber}`;
    const existing = await prisma.steelMelting.findUnique({ where: { heatInProcessNumber } });
    if (existing) {
      skippedHeats++;
      return;
    }

    const furnace = furnaces[spec.furnaceIdx];
    const lining = linings[spec.furnaceIdx];
    const plan = pick(plans, index);
    const emp = operator(index);

    const prepNumber = `CP-2026-${spec.heatNumber}`;
    const chargeNumber = `CH-2026-${spec.heatNumber}`;

    const chargePrep = await prisma.steelChargePreparation.create({
      data: {
        prepNumber,
        organizationId: org!.id,
        planId: plan.id,
        createdById: emp,
        stage: 'A12_HANDOVER_CLOSED',
        status: 'CLOSED',
        stockAvailabilityConfirmed: true,
        recipeScrapWeightTonnes: spec.inputTonnes * 0.68,
        recipeDriWeightTonnes: spec.inputTonnes * 0.20,
        recipeAlloyWeightTonnes: spec.inputTonnes * 0.07,
        recipeAdditiveWeightTonnes: spec.inputTonnes * 0.05,
        actualWeightTonnes: spec.inputTonnes,
        actualGrade: plan.grade,
        varianceApproved: true,
        chargeNumber,
        chargeReleasedAt: new Date(Date.now() - (spec.daysAgo + 0.5) * 86400000),
        furnaceReadinessConfirmed: true,
        plannedHeatReference: heatInProcessNumber,
        handoverClosedAt: new Date(Date.now() - (spec.daysAgo + 0.3) * 86400000),
      },
    });

    const meltingStartTime = spec.active
      ? new Date(Date.now() - rand(20, 90) * 60000)
      : new Date(Date.now() - spec.daysAgo * 86400000 - spec.cycleHours * 3600000);
    const handoverToRefiningAt = spec.active
      ? null
      : new Date(meltingStartTime.getTime() + spec.cycleHours * 3600000);
    const outputWeightTonnes = spec.active ? null : Number((spec.inputTonnes * spec.yieldFraction).toFixed(2));

    const melting = await prisma.steelMelting.create({
      data: {
        heatInProcessNumber,
        organizationId: org!.id,
        createdById: emp,
        chargePreparationId: chargePrep.id,
        stage: spec.active ? spec.activeStage! : 'A14_HANDOVER_TO_REFINING',
        status: spec.active ? 'IN_PROGRESS' : 'CLOSED',
        chargeNumberSnapshot: chargeNumber,
        recipeScrapWeightSnapshot: spec.inputTonnes * 0.68,
        recipeDriWeightSnapshot: spec.inputTonnes * 0.20,
        recipeAlloyWeightSnapshot: spec.inputTonnes * 0.07,
        recipeAdditiveWeightSnapshot: spec.inputTonnes * 0.05,
        furnaceId: furnace.code,
        furnaceRefId: furnace.id,
        plannedHeatRef: heatInProcessNumber,
        operatorName: `${employees[index % employees.length].firstName} ${employees[index % employees.length].lastName}`,
        shift: index % 2 === 0 ? 'Day' : 'Night',
        liningCampaignId: lining.id,
        liningRefId: lining.id,
        liningHeatCount: lining.heatsCompleted,
        liningVisualCondition: lining.condition,
        waterPressureFlowOk: true,
        powerSystemOk: true,
        hydraulicSystemOk: true,
        alarmsOk: true,
        materialLotRef: chargeNumber,
        actualWeightVsRecipeOk: true,
        loadingTime: meltingStartTime,
        loadingEquipment: 'Overhead crane + charge bucket',
        chargeSequence: 'Scrap -> DRI -> Alloy -> Additive',
        meltingStartTime,
        meltingFurnaceId: furnace.code,
        meltingOperator: `${employees[index % employees.length].firstName} ${employees[index % employees.length].lastName}`,
        meltingChargeId: chargeNumber,
        powerKwh: spec.active ? null : Number((spec.inputTonnes * rand(430, 520)).toFixed(0)),
        powerElapsedMinutes: spec.active ? null : Number((spec.cycleHours * 60 * 0.6).toFixed(0)),
        powerTonnage: spec.inputTonnes,
        temperatureCelsius: spec.peakTempC,
        temperatureElapsedMinutes: spec.active ? null : Number((spec.cycleHours * 60 * 0.75).toFixed(0)),
        outputWeightTonnes: outputWeightTonnes ?? undefined,
        outputChargeId: spec.active ? undefined : chargeNumber,
        outputFurnaceId: spec.active ? undefined : furnace.code,
        outputMeltTimeMinutes: spec.active ? undefined : Number((spec.cycleHours * 60).toFixed(0)),
        outputEnergyTotalKwh: spec.active ? undefined : Number((spec.inputTonnes * rand(430, 520)).toFixed(0)),
        liquidReady: spec.active ? undefined : true,
        liquidTemperatureCelsius: spec.active ? undefined : spec.peakTempC - Math.round(rand(15, 40)),
        liquidOperatorConfirmed: spec.active ? undefined : true,
        handoverToRefiningAt: handoverToRefiningAt ?? undefined,
      },
    });

    // Bump the lining's heats-completed counter to match, exactly like
    // MeltingService.refiningHandover does on a real A14 handover.
    if (!spec.active) {
      await prisma.furnaceLining.update({
        where: { id: lining.id },
        data: { heatsCompleted: { increment: 1 } },
      });
    }

    // ── Material charges (multi-row, realistic scrap/raw/alloy/additive mix) ──
    let sequence = 1;
    for (const row of MATERIAL_ROWS) {
      const planned = Number((spec.inputTonnes * row.shareOfInput).toFixed(2));
      // Active heats are mid-charge — only scrap+raw metal charged so far.
      if (spec.active && (row.category === HeatChargeMaterialCategory.ALLOY || row.category === HeatChargeMaterialCategory.ADDITIVE)) {
        continue;
      }
      const actual = Number((planned * rand(0.96, 1.03)).toFixed(2));
      await prisma.heatMaterialCharge.create({
        data: {
          organizationId: org!.id,
          meltingId: melting.id,
          sequence: sequence++,
          material: row.material,
          materialCategory: row.category,
          grade: plan.grade ?? undefined,
          batchRef: `${chargeNumber}-L${sequence}`,
          plannedQuantity: planned,
          actualQuantity: actual,
          unit: row.unit,
          chargedAt: new Date(meltingStartTime.getTime() + sequence * 8 * 60000),
          chargedById: emp,
        },
      });
    }

    // ── Heat-cycle events (realistic operational timeline) ──
    const events: { offsetMin: number; type: HeatCycleEventType; temp?: number; qty?: number; unit?: string; notes?: string }[] = [
      { offsetMin: 0, type: HeatCycleEventType.HEAT_STARTED, notes: `Heat ${heatInProcessNumber} started on ${furnace.code}` },
      { offsetMin: 5, type: HeatCycleEventType.FURNACE_CHARGING, notes: 'Scrap and DRI charged' },
      { offsetMin: 12, type: HeatCycleEventType.HEATING_STARTED },
      { offsetMin: 30, type: HeatCycleEventType.TEMPERATURE_READING, temp: Math.round(spec.peakTempC * 0.65) },
      { offsetMin: 45, type: HeatCycleEventType.MATERIAL_ADDITION, qty: Number((spec.inputTonnes * 0.07).toFixed(2)), unit: 'MT', notes: 'FeSi alloy addition' },
    ];
    if (!spec.active) {
      const cycleMin = spec.cycleHours * 60;
      events.push(
        { offsetMin: Math.round(cycleMin * 0.55), type: HeatCycleEventType.TEMPERATURE_READING, temp: Math.round(spec.peakTempC * 0.85) },
        { offsetMin: Math.round(cycleMin * 0.75), type: HeatCycleEventType.TARGET_TEMPERATURE_REACHED, temp: spec.peakTempC },
        { offsetMin: Math.round(cycleMin * 0.85), type: HeatCycleEventType.TAPPING_STARTED },
        { offsetMin: Math.round(cycleMin * 0.95), type: HeatCycleEventType.TAPPING_COMPLETED },
        { offsetMin: Math.round(cycleMin), type: HeatCycleEventType.HEAT_COMPLETED, notes: `Output ${outputWeightTonnes} T` },
      );
      // A couple of heats get a delay/alarm for realistic exception variety.
      if (index % 4 === 0) {
        events.push({ offsetMin: Math.round(cycleMin * 0.4), type: HeatCycleEventType.DELAY, notes: 'Brief power dip — resumed after 4 min' });
      }
      if (index % 5 === 0) {
        events.push({ offsetMin: Math.round(cycleMin * 0.6), type: HeatCycleEventType.ALARM, notes: 'Cooling water pressure alarm — cleared' });
      }
    }

    for (const ev of events) {
      await prisma.heatCycleEvent.create({
        data: {
          organizationId: org!.id,
          meltingId: melting.id,
          eventType: ev.type,
          occurredAt: new Date(meltingStartTime.getTime() + ev.offsetMin * 60000),
          temperatureCelsius: ev.temp,
          quantity: ev.qty,
          unit: ev.unit,
          notes: ev.notes,
          recordedById: emp,
        },
      });
    }

    createdHeats++;
  }

  for (let i = 0; i < completedSpecs.length; i++) await seedHeat(completedSpecs[i], i);
  for (let i = 0; i < activeSpecs.length; i++) await seedHeat(activeSpecs[i], completedSpecs.length + i);

  console.log(`Heats created: ${createdHeats}, skipped (already seeded): ${skippedHeats}`);
  console.log('P05 demo seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
