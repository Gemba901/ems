import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FurnaceService } from './furnace.service';
import {
  CreateFurnaceDto,
  UpdateFurnaceDto,
  QueryFurnacesDto,
  CreateFurnaceLiningDto,
  UpdateFurnaceLiningConditionDto,
  RetireFurnaceLiningDto,
} from './dto/furnace.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Day-to-day roles can read and record lining condition; only management
// creates/edits furnace master data, mirroring RELEASE_ROLES elsewhere in Steel.
const FURNACE_READ_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];
const FURNACE_ADMIN_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/** Furnace / FurnaceLining master data, reused by P05 Melting. */
@Controller('steel/furnaces')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...FURNACE_READ_ROLES)
export class FurnaceController {
  constructor(private furnaceService: FurnaceService) {}

  @Post()
  @Roles(...FURNACE_ADMIN_ROLES)
  create(@Body() dto: CreateFurnaceDto, @CurrentUser() user: AuthUser) {
    return this.furnaceService.create(dto, user.organizationId);
  }

  @Get()
  getAll(@Query() query: QueryFurnacesDto, @CurrentUser() user: AuthUser) {
    return this.furnaceService.getAll(user.organizationId, query);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.furnaceService.getById(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(...FURNACE_ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFurnaceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.furnaceService.update(id, dto, user.organizationId);
  }

  @Get(':id/linings')
  getLinings(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.furnaceService.getLiningsForFurnace(id, user.organizationId);
  }

  /** Starts a new lining campaign, retiring the furnace's current one if any. */
  @Post(':id/linings')
  @Roles(...FURNACE_ADMIN_ROLES)
  addLining(
    @Param('id') id: string,
    @Body() dto: CreateFurnaceLiningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.furnaceService.addLining(id, dto, user.organizationId);
  }

  @Patch('linings/:liningId/condition')
  updateLiningCondition(
    @Param('liningId') liningId: string,
    @Body() dto: UpdateFurnaceLiningConditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.furnaceService.updateLiningCondition(
      liningId,
      dto,
      user.organizationId,
    );
  }

  @Patch('linings/:liningId/retire')
  @Roles(...FURNACE_ADMIN_ROLES)
  retireLining(
    @Param('liningId') liningId: string,
    @Body() dto: RetireFurnaceLiningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.furnaceService.retireLining(liningId, dto, user.organizationId);
  }
}
