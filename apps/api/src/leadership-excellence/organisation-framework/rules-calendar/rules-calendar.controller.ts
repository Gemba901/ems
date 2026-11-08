import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ModuleType } from "db";
import Holidays from "date-holidays";
import { holidaySuggestions } from "./holiday-suggestions";
import { TenantRequired } from "src/tenancy/tenant-route.decorator";
import { TrustedTenantContextGuard } from "src/tenancy/trusted-tenant-context.guard";
import { TenantGuard } from "src/tenancy/tenant.guard";
import type { TenantRequest } from "src/tenancy/tenant-context";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { RequiresModule } from "src/auth/decorators/module.decorator";
import { Roles } from "src/auth/decorators/roles.decorator";
import { LEX_ALL, LEX_EDITORS } from "../../common/lex-roles";
import {
  CalendarActor,
  CalendarAction,
  calendarCapabilities,
  RulesCalendarService,
} from "./rules-calendar.service";
import { FREQUENCIES, Frequency } from "./calendar-model";
import { object } from "./calendar-validation";

function context(req: TenantRequest): {
  organizationId: string;
  actor: CalendarActor;
} {
  if (
    !req.tenant?.organizationId ||
    !req.user ||
    req.user.organizationId !== req.tenant.organizationId
  )
    throw new UnauthorizedException("Current company access is required.");
  return {
    organizationId: req.tenant.organizationId,
    actor: { userId: req.user.userId, role: req.user.roleLevel },
  };
}

@TenantRequired()
@Controller("leadership-excellence/organisation-framework/rules-calendar")
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class RulesCalendarController {
  constructor(private readonly service: RulesCalendarService) {}

  @Get()
  @Roles(...LEX_ALL)
  list(@Req() req: TenantRequest) {
    const c = context(req);
    return this.service.list(c.organizationId, c.actor);
  }

  @Post()
  @Roles(...LEX_EDITORS)
  create(@Req() req: TenantRequest, @Body() input: unknown) {
    const c = context(req);
    return this.service.create(c.organizationId, c.actor, object(input).rules);
  }

  @Post("preview")
  @Roles(...LEX_EDITORS)
  preview(@Req() req: TenantRequest, @Body() input: unknown) {
    const c = context(req);
    if (!calendarCapabilities(c.actor.role).edit)
      throw new ForbiddenException();
    const body = object(input);
    if (!FREQUENCIES.includes(body.frequency as Frequency))
      throw new BadRequestException("Choose a supported reporting frequency.");
    return this.service.preview(body.rules, body.frequency as Frequency);
  }

  @Get("countries")
  @Roles(...LEX_ALL)
  countries(@Req() req: TenantRequest) {
    context(req);
    return new Holidays().getCountries("en");
  }

  @Get("holiday-suggestions")
  @Roles(...LEX_EDITORS)
  holidays(
    @Req() req: TenantRequest,
    @Query("country") country: string,
    @Query("year") year: string,
  ) {
    const c = context(req);
    if (!calendarCapabilities(c.actor.role).edit)
      throw new ForbiddenException();
    const countries = new Holidays().getCountries("en");
    if (
      !/^[A-Z]{2}$/.test(country ?? "") ||
      !Object.prototype.hasOwnProperty.call(countries, country)
    )
      throw new BadRequestException("Choose a supported country.");
    if (
      !/^\d{4}$/.test(year ?? "") ||
      Number(year) < 1900 ||
      Number(year) > 2199
    )
      throw new BadRequestException("Choose a year between 1900 and 2199.");
    return holidaySuggestions(country, Number(year));
  }

  @Get(":id")
  @Roles(...LEX_ALL)
  read(@Req() req: TenantRequest, @Param("id") id: string) {
    const c = context(req);
    return this.service.read(c.organizationId, id, c.actor);
  }

  @Get(":id/history")
  @Roles(...LEX_EDITORS)
  history(@Req() req: TenantRequest, @Param("id") id: string) {
    const c = context(req);
    return this.service.history(c.organizationId, id, c.actor);
  }

  @Get(":id/versions/:version")
  @Roles(...LEX_ALL)
  async version(
    @Req() req: TenantRequest,
    @Param("id") id: string,
    @Param("version") version: string,
  ) {
    const c = context(req);
    if (!/^[1-9]\d{0,8}$/.test(version))
      throw new BadRequestException("Invalid calendar version.");
    const result = await this.service.getApproved(
      c.organizationId,
      id,
      Number(version),
    );
    if (!result)
      throw new NotFoundException("Approved calendar version not found.");
    return result;
  }

  @Post(":id/:action")
  @Roles(...LEX_EDITORS)
  mutate(
    @Req() req: TenantRequest,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    const c = context(req);
    if (
      !["save", "submit", "approve", "return", "withdraw", "revise"].includes(
        action,
      )
    )
      throw new BadRequestException("Unknown calendar action.");
    return this.service.mutate(
      c.organizationId,
      id,
      c.actor,
      action as CalendarAction,
      body,
    );
  }
}
