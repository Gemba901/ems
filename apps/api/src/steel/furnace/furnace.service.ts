import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateFurnaceDto,
  UpdateFurnaceDto,
  QueryFurnacesDto,
  CreateFurnaceLiningDto,
  UpdateFurnaceLiningConditionDto,
  RetireFurnaceLiningDto,
} from './dto/furnace.dto';

/**
 * Furnace / FurnaceLining — master data reused by P05 (Melting) for
 * structured furnace and lining selection, in place of the free-text
 * furnaceId/liningCampaignId fields SteelMelting already had. Not itself a
 * Steel Pxx process — it's equipment master data, same category as Employee
 * or UnitOfMeasure.
 */
@Injectable()
export class FurnaceService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateFurnaceDto, organizationId: string) {
    try {
      return await this.prisma.furnace.create({
        data: {
          organizationId,
          code: dto.code,
          name: dto.name,
          status: dto.status,
          notes: dto.notes,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A furnace with this code already exists.',
        );
      }
      throw err;
    }
  }

  async getAll(organizationId: string, query: QueryFurnacesDto) {
    const where: Prisma.FurnaceWhereInput = {
      organizationId,
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.furnace.findMany({
      where,
      include: {
        linings: {
          where: { status: 'ACTIVE' },
          orderBy: { installedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  private async findFurnaceOrThrow(id: string, organizationId: string) {
    const furnace = await this.prisma.furnace.findFirst({
      where: { id, organizationId },
      include: {
        linings: { orderBy: { installedAt: 'desc' } },
      },
    });
    if (!furnace) throw new NotFoundException('Furnace not found');
    return furnace;
  }

  async getById(id: string, organizationId: string) {
    return this.findFurnaceOrThrow(id, organizationId);
  }

  async update(id: string, dto: UpdateFurnaceDto, organizationId: string) {
    await this.findFurnaceOrThrow(id, organizationId);
    return this.prisma.furnace.update({
      where: { id },
      data: { name: dto.name, status: dto.status, notes: dto.notes },
    });
  }

  // Starts a new lining campaign. Retires any currently ACTIVE lining first
  // — a furnace has at most one active lining at a time.
  async addLining(
    furnaceId: string,
    dto: CreateFurnaceLiningDto,
    organizationId: string,
  ) {
    await this.findFurnaceOrThrow(furnaceId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      await tx.furnaceLining.updateMany({
        where: { furnaceId, status: 'ACTIVE' },
        data: { status: 'RETIRED', retiredAt: new Date() },
      });
      return tx.furnaceLining.create({
        data: {
          organizationId,
          furnaceId,
          code: dto.code,
          installedAt: dto.installedAt ? new Date(dto.installedAt) : new Date(),
          material: dto.material,
          condition: dto.condition,
          thicknessRemainingMm: dto.thicknessRemainingMm,
          inspectionNotes: dto.inspectionNotes,
        },
      });
    });
  }

  private async findLiningOrThrow(id: string, organizationId: string) {
    const lining = await this.prisma.furnaceLining.findFirst({
      where: { id, organizationId },
    });
    if (!lining) throw new NotFoundException('Furnace lining not found');
    return lining;
  }

  async updateLiningCondition(
    id: string,
    dto: UpdateFurnaceLiningConditionDto,
    organizationId: string,
  ) {
    await this.findLiningOrThrow(id, organizationId);
    return this.prisma.furnaceLining.update({
      where: { id },
      data: {
        condition: dto.condition,
        thicknessRemainingMm: dto.thicknessRemainingMm,
        inspectionNotes: dto.inspectionNotes,
      },
    });
  }

  async retireLining(
    id: string,
    dto: RetireFurnaceLiningDto,
    organizationId: string,
  ) {
    const lining = await this.findLiningOrThrow(id, organizationId);
    if (lining.status === 'RETIRED') {
      throw new ConflictException('This lining has already been retired.');
    }
    return this.prisma.furnaceLining.update({
      where: { id },
      data: {
        status: 'RETIRED',
        retiredAt: new Date(),
        inspectionNotes: dto.notes ?? lining.inspectionNotes,
      },
    });
  }

  async getLiningsForFurnace(furnaceId: string, organizationId: string) {
    await this.findFurnaceOrThrow(furnaceId, organizationId);
    return this.prisma.furnaceLining.findMany({
      where: { furnaceId, organizationId },
      orderBy: { installedAt: 'desc' },
    });
  }
}
