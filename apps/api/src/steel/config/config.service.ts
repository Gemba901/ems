import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CreditStatus, PlantRoute, ProductType } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCustomerDto,
  CreateDealerDto,
  CreateLookupDto,
  CreateMaterialDto,
  CreateProductDto,
  CreateProductSpecificationDto,
  CreateProductionRouteDto,
  CreateQcdCriteriaDto,
  CreateRouteStepDto,
  CreateSupplierMaterialDto,
  ImportEntityType,
  ReorderRouteStepsDto,
  UpdateCustomerDto,
  UpdateDealerDto,
  UpdateLookupDto,
  UpdateMaterialDto,
  UpdateProductDto,
  UpdateProductSpecificationDto,
  UpdateProductionRouteDto,
  UpdateQcdCriteriaDto,
  UpdateRouteStepDto,
  UpdateSupplierMaterialDto,
} from './dto/config.dto';
import { SteelLookupType } from 'db';

/**
 * Admin CRUD over Steel Configuration master data — the write side of
 * MasterDataModule's read-only lookups. Planners never hit this module;
 * only Steel Admin/Management roles do (enforced at the controller).
 */
// Small select shape reused wherever a config entity's response should carry
// "who configured / last updated this" without an extra roundtrip.
const actorInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true } },
};

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  private searchFilter(includeInactive: string | undefined) {
    return includeInactive === 'true' ? {} : { isActive: true };
  }

  private async resolveEmployeeId(
    organizationId: string,
    userId?: string,
  ): Promise<string | undefined> {
    if (!userId) return undefined;
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    return employee?.id;
  }

  // ── Products ──
  async listProducts(
    organizationId: string,
    q?: string,
    includeInactive?: string,
  ) {
    return this.prisma.steelProduct.findMany({
      where: {
        organizationId,
        ...this.searchFilter(includeInactive),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createProduct(organizationId: string, dto: CreateProductDto) {
    const existing = await this.prisma.steelProduct.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(
        `Product code "${dto.code}" already exists.`,
      );
    return this.prisma.steelProduct.create({
      data: { ...dto, organizationId },
    });
  }

  async updateProduct(
    id: string,
    organizationId: string,
    dto: UpdateProductDto,
  ) {
    await this.assertOwned('steelProduct', id, organizationId);
    return this.prisma.steelProduct.update({ where: { id }, data: dto });
  }

  // ── Product Specifications ──
  async listProductSpecifications(
    organizationId: string,
    q?: string,
    productId?: string,
    includeInactive?: string,
  ) {
    const specs = await this.prisma.steelProductSpecification.findMany({
      where: {
        organizationId,
        ...this.searchFilter(includeInactive),
        ...(productId && { productId }),
        ...(q && {
          OR: [
            { grade: { contains: q, mode: 'insensitive' } },
            { size: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: { product: true },
      orderBy: { grade: 'asc' },
    });
    return specs.map((s) => ({
      ...s,
      displayLabel: [
        s.grade,
        `— ${s.size} ${s.product.name}`,
        `— ${s.standard}`,
        s.length ? `— ${s.length}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    }));
  }

  async createProductSpecification(
    organizationId: string,
    dto: CreateProductSpecificationDto,
  ) {
    const product = await this.prisma.steelProduct.findFirst({
      where: { id: dto.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found.');
    const existing = await this.prisma.steelProductSpecification.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(
        `Specification code "${dto.code}" already exists.`,
      );
    return this.prisma.steelProductSpecification.create({
      data: { ...dto, organizationId },
    });
  }

  async updateProductSpecification(
    id: string,
    organizationId: string,
    dto: UpdateProductSpecificationDto,
  ) {
    await this.assertOwned('steelProductSpecification', id, organizationId);
    return this.prisma.steelProductSpecification.update({
      where: { id },
      data: dto,
    });
  }

  // ── Production Routes ──
  async listRoutes(
    organizationId: string,
    q?: string,
    includeInactive?: string,
  ) {
    return this.prisma.steelProductionRoute.findMany({
      where: {
        organizationId,
        ...this.searchFilter(includeInactive),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createRoute(organizationId: string, dto: CreateProductionRouteDto) {
    const existing = await this.prisma.steelProductionRoute.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(`Route code "${dto.code}" already exists.`);
    return this.prisma.steelProductionRoute.create({
      data: { ...dto, organizationId },
    });
  }

  async updateRoute(
    id: string,
    organizationId: string,
    dto: UpdateProductionRouteDto,
  ) {
    await this.assertOwned('steelProductionRoute', id, organizationId);
    return this.prisma.steelProductionRoute.update({
      where: { id },
      data: dto,
    });
  }

  async addRouteStep(
    routeId: string,
    organizationId: string,
    dto: CreateRouteStepDto,
  ) {
    const route = await this.prisma.steelProductionRoute.findFirst({
      where: { id: routeId, organizationId },
    });
    if (!route) throw new NotFoundException('Route not found.');
    const maxSeq = await this.prisma.steelProductionRouteStep.aggregate({
      where: { routeId },
      _max: { sequence: true },
    });
    return this.prisma.steelProductionRouteStep.create({
      data: { ...dto, routeId, sequence: (maxSeq._max.sequence ?? 0) + 1 },
    });
  }

  async updateRouteStep(
    stepId: string,
    organizationId: string,
    dto: UpdateRouteStepDto,
  ) {
    const step = await this.prisma.steelProductionRouteStep.findFirst({
      where: { id: stepId, route: { organizationId } },
    });
    if (!step) throw new NotFoundException('Route step not found.');
    return this.prisma.steelProductionRouteStep.update({
      where: { id: stepId },
      data: dto,
    });
  }

  async deleteRouteStep(stepId: string, organizationId: string) {
    const step = await this.prisma.steelProductionRouteStep.findFirst({
      where: { id: stepId, route: { organizationId } },
    });
    if (!step) throw new NotFoundException('Route step not found.');
    await this.prisma.steelProductionRouteStep.delete({
      where: { id: stepId },
    });
    // Resequence remaining steps so sequence stays contiguous from 1.
    const remaining = await this.prisma.steelProductionRouteStep.findMany({
      where: { routeId: step.routeId },
      orderBy: { sequence: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((s, i) =>
        this.prisma.steelProductionRouteStep.update({
          where: { id: s.id },
          data: { sequence: i + 1 },
        }),
      ),
    );
    return { success: true };
  }

  async reorderRouteSteps(
    routeId: string,
    organizationId: string,
    dto: ReorderRouteStepsDto,
  ) {
    const route = await this.prisma.steelProductionRoute.findFirst({
      where: { id: routeId, organizationId },
      include: { steps: true },
    });
    if (!route) throw new NotFoundException('Route not found.');
    if (
      dto.stepIdsInOrder.length !== route.steps.length ||
      route.steps.some((s) => !dto.stepIdsInOrder.includes(s.id))
    ) {
      throw new BadRequestException(
        "stepIdsInOrder must contain exactly the route's current steps.",
      );
    }
    // Two-phase update avoids transient collisions with the @@unique([routeId, sequence]) constraint.
    await this.prisma.$transaction(
      dto.stepIdsInOrder.map((id, i) =>
        this.prisma.steelProductionRouteStep.update({
          where: { id },
          data: { sequence: -(i + 1) },
        }),
      ),
    );
    await this.prisma.$transaction(
      dto.stepIdsInOrder.map((id, i) =>
        this.prisma.steelProductionRouteStep.update({
          where: { id },
          data: { sequence: i + 1 },
        }),
      ),
    );
    return this.prisma.steelProductionRouteStep.findMany({
      where: { routeId },
      orderBy: { sequence: 'asc' },
    });
  }

  // ── Customers ──
  async listCustomers(
    organizationId: string,
    q?: string,
    includeInactive?: string,
  ) {
    return this.prisma.customer.findMany({
      where: {
        organizationId,
        dealerName: null,
        ...this.searchFilter(includeInactive),
        ...(q && { name: { contains: q, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCustomer(organizationId: string, dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing)
      throw new BadRequestException(`Customer "${dto.name}" already exists.`);
    return this.prisma.customer.create({ data: { ...dto, organizationId } });
  }

  async updateCustomer(
    id: string,
    organizationId: string,
    dto: UpdateCustomerDto,
  ) {
    await this.assertOwned('customer', id, organizationId);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  // ── Dealers ──
  async listDealers(
    organizationId: string,
    q?: string,
    includeInactive?: string,
  ) {
    return this.prisma.dealer.findMany({
      where: {
        organizationId,
        ...this.searchFilter(includeInactive),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDealer(organizationId: string, dto: CreateDealerDto) {
    const existing = await this.prisma.dealer.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(
        `Dealer code "${dto.code}" already exists.`,
      );
    return this.prisma.dealer.create({ data: { ...dto, organizationId } });
  }

  async updateDealer(id: string, organizationId: string, dto: UpdateDealerDto) {
    await this.assertOwned('dealer', id, organizationId);
    return this.prisma.dealer.update({ where: { id }, data: dto });
  }

  // ── Materials ──
  async listMaterials(
    organizationId: string,
    q?: string,
    includeInactive?: string,
  ) {
    return this.prisma.steelMaterialMaster.findMany({
      where: {
        organizationId,
        ...this.searchFilter(includeInactive),
        ...(q && {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      include: actorInclude,
      orderBy: { name: 'asc' },
    });
  }

  async createMaterial(
    organizationId: string,
    dto: CreateMaterialDto,
    userId?: string,
  ) {
    const existing = await this.prisma.steelMaterialMaster.findUnique({
      where: { organizationId_code: { organizationId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(
        `Material code "${dto.code}" already exists.`,
      );
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelMaterialMaster.create({
      data: {
        ...dto,
        organizationId,
        createdById: employeeId,
        updatedById: employeeId,
      },
      include: actorInclude,
    });
  }

  async updateMaterial(
    id: string,
    organizationId: string,
    dto: UpdateMaterialDto,
    userId?: string,
  ) {
    await this.assertOwned('steelMaterialMaster', id, organizationId);
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelMaterialMaster.update({
      where: { id },
      data: { ...dto, ...(employeeId && { updatedById: employeeId }) },
      include: actorInclude,
    });
  }

  // ── Supplier ↔ Material eligibility (P02-A03) ──
  async listSupplierMaterials(
    organizationId: string,
    supplierId?: string,
    materialId?: string,
  ) {
    return this.prisma.steelSupplierMaterial.findMany({
      where: {
        organizationId,
        ...(supplierId && { supplierId }),
        ...(materialId && { materialId }),
      },
      include: { supplier: true, material: true, ...actorInclude },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSupplierMaterial(
    organizationId: string,
    dto: CreateSupplierMaterialDto,
    userId?: string,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found.');
    const material = await this.prisma.steelMaterialMaster.findFirst({
      where: { id: dto.materialId, organizationId },
    });
    if (!material) throw new NotFoundException('Material not found.');
    const existing = await this.prisma.steelSupplierMaterial.findUnique({
      where: {
        supplierId_materialId: {
          supplierId: dto.supplierId,
          materialId: dto.materialId,
        },
      },
    });
    if (existing)
      throw new BadRequestException(
        'This supplier is already linked to this material.',
      );
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelSupplierMaterial.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        materialId: dto.materialId,
        isEligible: dto.isEligible ?? true,
        specificationReference: dto.specificationReference,
        createdById: employeeId,
        updatedById: employeeId,
      },
      include: actorInclude,
    });
  }

  async updateSupplierMaterial(
    id: string,
    organizationId: string,
    dto: UpdateSupplierMaterialDto,
    userId?: string,
  ) {
    const record = await this.prisma.steelSupplierMaterial.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('Record not found.');
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelSupplierMaterial.update({
      where: { id },
      data: { ...dto, ...(employeeId && { updatedById: employeeId }) },
      include: actorInclude,
    });
  }

  async deleteSupplierMaterial(id: string, organizationId: string) {
    const record = await this.prisma.steelSupplierMaterial.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('Record not found.');
    await this.prisma.steelSupplierMaterial.delete({ where: { id } });
    return { success: true };
  }

  // ── QCD criteria (P02-A06) ──
  async listQcdCriteria(organizationId: string, includeInactive?: string) {
    return this.prisma.steelQcdCriteria.findMany({
      where: { organizationId, ...this.searchFilter(includeInactive) },
      include: actorInclude,
      orderBy: { name: 'asc' },
    });
  }

  async createQcdCriteria(
    organizationId: string,
    dto: CreateQcdCriteriaDto,
    userId?: string,
  ) {
    const existing = await this.prisma.steelQcdCriteria.findUnique({
      where: { organizationId_name: { organizationId, name: dto.name } },
    });
    if (existing)
      throw new BadRequestException(
        `QCD criteria "${dto.name}" already exists.`,
      );
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelQcdCriteria.create({
      data: {
        ...dto,
        organizationId,
        createdById: employeeId,
        updatedById: employeeId,
      },
      include: actorInclude,
    });
  }

  async updateQcdCriteria(
    id: string,
    organizationId: string,
    dto: UpdateQcdCriteriaDto,
    userId?: string,
  ) {
    const record = await this.prisma.steelQcdCriteria.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('QCD criteria not found.');
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelQcdCriteria.update({
      where: { id },
      data: { ...dto, ...(employeeId && { updatedById: employeeId }) },
      include: actorInclude,
    });
  }

  // ── Procurement supporting lookups ──
  async listLookups(
    organizationId: string,
    type?: SteelLookupType,
    includeInactive?: string,
  ) {
    return this.prisma.steelLookup.findMany({
      where: {
        organizationId,
        ...(type && { type }),
        ...this.searchFilter(includeInactive),
      },
      include: actorInclude,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createLookup(
    organizationId: string,
    dto: CreateLookupDto,
    userId?: string,
  ) {
    const existing = await this.prisma.steelLookup.findUnique({
      where: {
        organizationId_type_code: {
          organizationId,
          type: dto.type,
          code: dto.code,
        },
      },
    });
    if (existing)
      throw new BadRequestException(
        `"${dto.code}" already exists for ${dto.type}.`,
      );
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelLookup.create({
      data: {
        ...dto,
        organizationId,
        createdById: employeeId,
        updatedById: employeeId,
      },
      include: actorInclude,
    });
  }

  async updateLookup(
    id: string,
    organizationId: string,
    dto: UpdateLookupDto,
    userId?: string,
  ) {
    const record = await this.prisma.steelLookup.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('Lookup not found.');
    const employeeId = await this.resolveEmployeeId(organizationId, userId);
    return this.prisma.steelLookup.update({
      where: { id },
      data: { ...dto, ...(employeeId && { updatedById: employeeId }) },
      include: actorInclude,
    });
  }

  private async assertOwned(
    model:
      | 'steelProduct'
      | 'steelProductSpecification'
      | 'steelProductionRoute'
      | 'customer'
      | 'dealer'
      | 'steelMaterialMaster',
    id: string,
    organizationId: string,
  ) {
    const where = { id, organizationId };
    let record: Record<string, unknown> | null = null;
    switch (model) {
      case 'steelProduct':
        record = await this.prisma.steelProduct.findFirst({ where });
        break;
      case 'steelProductSpecification':
        record = await this.prisma.steelProductSpecification.findFirst({
          where,
        });
        break;
      case 'steelProductionRoute':
        record = await this.prisma.steelProductionRoute.findFirst({ where });
        break;
      case 'customer':
        record = await this.prisma.customer.findFirst({ where });
        break;
      case 'dealer':
        record = await this.prisma.dealer.findFirst({ where });
        break;
      case 'steelMaterialMaster':
        record = await this.prisma.steelMaterialMaster.findFirst({ where });
        break;
    }
    if (!record) throw new NotFoundException('Record not found.');
    return record;
  }

  // ── Import ──
  async previewImport(
    entity: ImportEntityType,
    organizationId: string,
    buffer: Buffer,
  ) {
    const rows = this.parseWorkbook(buffer);
    return this.validateRows(entity, organizationId, rows);
  }

  async commitImport(
    entity: ImportEntityType,
    organizationId: string,
    buffer: Buffer,
  ) {
    const rows = this.parseWorkbook(buffer);
    const { valid } = await this.validateRows(entity, organizationId, rows);
    let created = 0;
    for (const row of valid) {
      await this.importOneRow(entity, organizationId, row.data);
      created++;
    }
    return { created, skipped: rows.length - created };
  }

  private parseWorkbook(buffer: Buffer): Record<string, any>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  private async validateRows(
    entity: ImportEntityType,
    organizationId: string,
    rows: Record<string, any>[],
  ) {
    const results: {
      row: number;
      data: Record<string, any>;
      errors: string[];
    }[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const data = rows[i];
      const errors: string[] = [];
      const requiredFields = this.requiredFieldsFor(entity);
      for (const field of requiredFields) {
        if (!data[field] || String(data[field]).trim() === '')
          errors.push(`Missing "${field}"`);
      }
      const codeField = entity === 'customers' ? 'name' : 'code';
      const codeValue = String(data[codeField] ?? '').trim();
      if (codeValue) {
        if (seenCodes.has(codeValue))
          errors.push(`Duplicate "${codeField}" within file: ${codeValue}`);
        seenCodes.add(codeValue);
        const exists = await this.codeExists(entity, organizationId, codeValue);
        if (exists)
          errors.push(`"${codeValue}" already exists in this organization`);
      }
      if (entity === 'product-specifications' && data.productCode) {
        const product = await this.prisma.steelProduct.findUnique({
          where: {
            organizationId_code: {
              organizationId,
              code: String(data.productCode),
            },
          },
        });
        if (!product) errors.push(`Unknown productCode "${data.productCode}"`);
      }
      results.push({ row: i + 2, data, errors });
    }

    return {
      totalRows: rows.length,
      validCount: results.filter((r) => r.errors.length === 0).length,
      errorCount: results.filter((r) => r.errors.length > 0).length,
      rows: results,
      valid: results.filter((r) => r.errors.length === 0),
    };
  }

  private requiredFieldsFor(entity: ImportEntityType): string[] {
    switch (entity) {
      case 'products':
        return ['name', 'code', 'productType'];
      case 'product-specifications':
        return ['productCode', 'code', 'grade', 'size', 'standard'];
      case 'customers':
        return ['name'];
      case 'dealers':
        return ['name', 'code'];
      case 'materials':
        return ['name', 'code', 'unit'];
      case 'production-routes':
        return ['name', 'code', 'plantRoute'];
    }
  }

  private async codeExists(
    entity: ImportEntityType,
    organizationId: string,
    code: string,
  ): Promise<boolean> {
    switch (entity) {
      case 'products':
        return !!(await this.prisma.steelProduct.findUnique({
          where: { organizationId_code: { organizationId, code } },
        }));
      case 'product-specifications':
        return !!(await this.prisma.steelProductSpecification.findUnique({
          where: { organizationId_code: { organizationId, code } },
        }));
      case 'customers':
        return !!(await this.prisma.customer.findUnique({
          where: { organizationId_name: { organizationId, name: code } },
        }));
      case 'dealers':
        return !!(await this.prisma.dealer.findUnique({
          where: { organizationId_code: { organizationId, code } },
        }));
      case 'materials':
        return !!(await this.prisma.steelMaterialMaster.findUnique({
          where: { organizationId_code: { organizationId, code } },
        }));
      case 'production-routes':
        return !!(await this.prisma.steelProductionRoute.findUnique({
          where: { organizationId_code: { organizationId, code } },
        }));
    }
  }

  private async importOneRow(
    entity: ImportEntityType,
    organizationId: string,
    data: Record<string, any>,
  ) {
    const str = (v: string | number | boolean | undefined | null): string =>
      v === undefined || v === null ? '' : String(v);
    const strOrNull = (
      v: string | number | boolean | undefined | null,
    ): string | null =>
      v === undefined || v === null || v === '' ? null : String(v);

    switch (entity) {
      case 'products':
        return this.prisma.steelProduct.create({
          data: {
            organizationId,
            name: str(data.name),
            code: str(data.code),
            productType: str(data.productType) as ProductType,
          },
        });
      case 'product-specifications': {
        const product = await this.prisma.steelProduct.findUnique({
          where: {
            organizationId_code: {
              organizationId,
              code: str(data.productCode),
            },
          },
        });
        if (!product) return;
        return this.prisma.steelProductSpecification.create({
          data: {
            organizationId,
            productId: product.id,
            code: str(data.code),
            grade: str(data.grade),
            size: str(data.size),
            standard: str(data.standard),
            length: strOrNull(data.length),
            toleranceNotes: strOrNull(data.toleranceNotes),
          },
        });
      }
      case 'customers':
        return this.prisma.customer.create({
          data: {
            organizationId,
            name: str(data.name),
            defaultDeliveryLocation: strOrNull(data.defaultDeliveryLocation),
            creditStatus: strOrNull(data.creditStatus) as CreditStatus | null,
          },
        });
      case 'dealers':
        return this.prisma.dealer.create({
          data: {
            organizationId,
            name: str(data.name),
            code: str(data.code),
            region: strOrNull(data.region),
          },
        });
      case 'materials':
        return this.prisma.steelMaterialMaster.create({
          data: {
            organizationId,
            name: str(data.name),
            code: str(data.code),
            unit: str(data.unit),
          },
        });
      case 'production-routes':
        return this.prisma.steelProductionRoute.create({
          data: {
            organizationId,
            name: str(data.name),
            code: str(data.code),
            plantRoute: str(data.plantRoute) as PlantRoute,
          },
        });
    }
  }
}
