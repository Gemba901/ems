import { Injectable } from '@nestjs/common';
import { AvailabilityStatus, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  QueryFinishedGoodsStockDto,
  QueryMaterialAvailabilityDto,
  QueryProductSpecificationsDto,
  QueryProductsDto,
  SearchQueryDto,
} from './dto/master-data.dto';

/**
 * Read-only lookup/search endpoints over P01 master data (Customer, Product,
 * ProductSpecification, ProductionRoute, MaterialMaster) plus derived
 * availability checks, so P01 screens can select from what the system
 * already knows instead of free-typing it. Furnace lookups already live in
 * FurnaceModule and are not duplicated here.
 */
@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  async getCustomers(organizationId: string, query: SearchQueryDto) {
    return this.prisma.customer.findMany({
      where: {
        organizationId,
        isActive: true,
        dealerName: null,
        ...(query.q && { name: { contains: query.q, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  // Dealers are a distinct Configuration master model (see Dealer) — kept
  // separate from Customer, whose legacy `dealerName` free-text field is no
  // longer populated for new records once Configuration is in use.
  async getDealers(organizationId: string, query: SearchQueryDto) {
    return this.prisma.dealer.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(query.q && {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getProducts(organizationId: string, query: QueryProductsDto) {
    return this.prisma.steelProduct.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(query.productType && { productType: query.productType }),
        ...(query.q && {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getProductSpecifications(
    organizationId: string,
    query: QueryProductSpecificationsDto,
  ) {
    const where: Prisma.SteelProductSpecificationWhereInput = {
      organizationId,
      isActive: true,
      ...(query.productId && { productId: query.productId }),
      ...(query.q && {
        OR: [
          { grade: { contains: query.q, mode: 'insensitive' } },
          { size: { contains: query.q, mode: 'insensitive' } },
          { standard: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const specs = await this.prisma.steelProductSpecification.findMany({
      where,
      include: { product: true },
      orderBy: { grade: 'asc' },
      take: 50,
    });
    // Display label: `{grade} — {size} {product} — {standard} — {length}`
    return specs.map((spec) => ({
      ...spec,
      displayLabel: [
        spec.grade,
        `— ${spec.size} ${spec.product.name}`,
        `— ${spec.standard}`,
        spec.length ? `— ${spec.length}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    }));
  }

  async getRoutes(organizationId: string, query: SearchQueryDto) {
    return this.prisma.steelProductionRoute.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(query.q && {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getRouteSteps(routeId: string, organizationId: string) {
    return this.prisma.steelProductionRouteStep.findMany({
      where: { routeId, route: { organizationId } },
      orderBy: { sequence: 'asc' },
    });
  }

  async getMaterials(organizationId: string, query: SearchQueryDto) {
    return this.prisma.steelMaterialMaster.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(query.q && {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getFurnaces(organizationId: string, query: SearchQueryDto) {
    return this.prisma.furnace.findMany({
      where: {
        organizationId,
        ...(query.q && {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        linings: { where: { status: 'ACTIVE' }, take: 1 },
      },
      orderBy: { code: 'asc' },
    });
  }

  // Certified finished-goods stock available for a spec — consulted read-only
  // by P01-A05 to auto-fill certifiedStockAvailableQty/bundleIds/etc.
  async getFinishedGoodsStock(
    organizationId: string,
    query: QueryFinishedGoodsStockDto,
  ) {
    const rows = await this.prisma.steelFinishedGoodsStock.findMany({
      where: {
        organizationId,
        productSpecificationId: query.productSpecificationId,
      },
    });
    return {
      certifiedQtyTonnes: rows.reduce(
        (sum, r) => sum + r.certifiedQtyTonnes,
        0,
      ),
      bundleIds: rows.flatMap((r) => r.bundleIds),
      heatNumbers: rows.flatMap((r) => r.heatNumbers),
      certificateRefs: rows.flatMap((r) => r.certificateRefs),
    };
  }

  // Best-effort raw-material availability: sums netWeightTonnes of RELEASED
  // (accepted) P03 intakes of the requested materialType. See dto comment —
  // there is no separate stock ledger to check against yet.
  async getMaterialAvailability(
    organizationId: string,
    query: QueryMaterialAvailabilityDto,
  ) {
    const result = await this.prisma.steelMaterialIntake.aggregate({
      where: {
        organizationId,
        materialType: query.materialType,
        status: 'RELEASED',
      },
      _sum: { netWeightTonnes: true },
    });
    const availableQtyTonnes = result._sum.netWeightTonnes ?? 0;

    let status: AvailabilityStatus;
    if (availableQtyTonnes >= query.requiredQtyTonnes) {
      status = 'AVAILABLE';
    } else if (availableQtyTonnes > 0) {
      status = 'PARTIAL';
    } else {
      status = 'NOT_AVAILABLE';
    }

    return {
      materialType: query.materialType,
      requiredQtyTonnes: query.requiredQtyTonnes,
      availableQtyTonnes,
      status,
    };
  }
}
