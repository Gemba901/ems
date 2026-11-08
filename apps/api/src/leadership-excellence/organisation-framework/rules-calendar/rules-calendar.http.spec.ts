import { Test } from "@nestjs/testing";
import { INestApplication, UnauthorizedException } from "@nestjs/common";
import request from "supertest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Role } from "src/common/enum/role.enum";
import { PrismaService } from "src/prisma/prisma.service";
import { TrustedTenantContextGuard } from "src/tenancy/trusted-tenant-context.guard";
import { TenantGuard } from "src/tenancy/tenant.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { RulesCalendarController } from "./rules-calendar.controller";
import { RulesCalendarService } from "./rules-calendar.service";

describe("02.03 HTTP company boundary", () => {
  let app: INestApplication;
  const service = {
    list: jest.fn(async () => ({ calendars: [] })),
    create: jest.fn(async () => ({ id: "new" })),
    read: jest.fn(async () => ({ id: "saved" })),
  };
  const prisma = {
    userOrganization: {
      findUnique: jest.fn(async ({ where }) => ({
        roleId: 1,
        role: {
          name:
            where.userId_organizationId.userId === "employee"
              ? Role.EMPLOYEE
              : Role.MANAGEMENT,
        },
        organization: { status: "ACTIVE", isAdminOrg: false },
      })),
    },
    organization: {
      findUnique: jest.fn(async () => ({
        modules: ["LEADERSHIP_EXCELLENCE"],
        isAdminOrg: false,
      })),
    },
  };
  beforeAll(async () => {
    const builder = Test.createTestingModule({
      controllers: [RulesCalendarController],
      providers: [
        { provide: RulesCalendarService, useValue: service },
        { provide: PrismaService, useValue: prisma },
        TenantGuard,
        RolesGuard,
        ModuleGuard,
      ],
    });
    builder.overrideGuard(TrustedTenantContextGuard).useValue({
      canActivate(ctx) {
        ctx.switchToHttp().getRequest().tenant = { organizationId: "org-a" };
        return true;
      },
    });
    builder.overrideGuard(JwtAuthGuard).useValue({
      canActivate(ctx) {
        const req = ctx.switchToHttp().getRequest();
        if (!req.headers.authorization) throw new UnauthorizedException();
        req.user = {
          userId: req.headers["x-test-user"] || "manager",
          organizationId: req.headers["x-test-company"] || "org-a",
          tokenType: "ACCESS",
          roleLevel: Role.MANAGEMENT,
        };
        return true;
      },
    });
    app = (await builder.compile()).createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(() => jest.clearAllMocks());
  const path = "/leadership-excellence/organisation-framework/rules-calendar";
  it("resolves company before authentication and authorisation", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, RulesCalendarController),
    ).toEqual([
      TrustedTenantContextGuard,
      JwtAuthGuard,
      TenantGuard,
      RolesGuard,
      ModuleGuard,
    ]);
  });
  it("requires authentication", async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });
  it("rejects another company token", async () => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", "test")
      .set("x-test-company", "org-b")
      .expect(403);
    expect(service.list).not.toHaveBeenCalled();
  });
  it("uses the trusted company despite query or body company IDs", async () => {
    await request(app.getHttpServer())
      .get(`${path}?organizationId=org-b`)
      .set("Authorization", "test")
      .expect(200);
    expect(service.list).toHaveBeenCalledWith("org-a", expect.anything());
    await request(app.getHttpServer())
      .post(path)
      .set("Authorization", "test")
      .send({ organizationId: "org-b", rules: {} })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith("org-a", expect.anything(), {});
  });
  it("rechecks current database role, preventing employee writes with a stale management claim", async () => {
    await request(app.getHttpServer())
      .post(path)
      .set("Authorization", "test")
      .set("x-test-user", "employee")
      .send({ rules: {} })
      .expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("returns current Kenya observed dates through the protected holiday endpoint", async () => {
    const response = await request(app.getHttpServer())
      .get(`${path}/holiday-suggestions?country=KE&year=2027`)
      .set("Authorization", "test")
      .expect(200);
    expect(
      response.body.suggestions.find(
        (h: { date: string }) => h.date === "2027-10-11",
      ),
    ).toMatchObject({
      originalDate: "2027-10-10",
      reason: expect.stringContaining("Mazingira"),
    });
  });
  it("rejects malformed holiday parameters without treating them as paths", async () => {
    await request(app.getHttpServer())
      .get(`${path}/holiday-suggestions?country=../KE&year=2027`)
      .set("Authorization", "test")
      .expect(400);
    await request(app.getHttpServer())
      .get(`${path}/holiday-suggestions?country=KE&year=2027x`)
      .set("Authorization", "test")
      .expect(400);
  });
  it("keeps employee and wrong-company requests out of the suggestion editor", async () => {
    await request(app.getHttpServer())
      .get(`${path}/holiday-suggestions?country=KE&year=2027`)
      .set("Authorization", "test")
      .set("x-test-user", "employee")
      .expect(403);
    await request(app.getHttpServer())
      .get(`${path}/holiday-suggestions?country=KE&year=2027`)
      .set("Authorization", "test")
      .set("x-test-company", "org-b")
      .expect(403);
  });
});
