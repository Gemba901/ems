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
import { OrganogramController } from "./organogram.controller";
import { OrganogramService } from "./organogram.service";

describe("02.01 HTTP company boundary", () => {
  let app: INestApplication;
  const service = {
    getView: jest.fn(async () => ({ units: [] })),
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
      controllers: [OrganogramController],
      providers: [
        { provide: OrganogramService, useValue: service },
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
  const path = "/leadership-excellence/organisation-framework/organogram";
  it("resolves company before authentication and authorisation", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OrganogramController)).toEqual([
      TrustedTenantContextGuard,
      JwtAuthGuard,
      TenantGuard,
      RolesGuard,
      ModuleGuard,
    ]);
  });
  it("requires authentication", async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(service.getView).not.toHaveBeenCalled();
  });
  it("rejects another company token", async () => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", "test")
      .set("x-test-company", "org-b")
      .expect(403);
    expect(service.getView).not.toHaveBeenCalled();
  });
  it("uses the trusted company despite query or body company IDs", async () => {
    await request(app.getHttpServer())
      .get(`${path}?organizationId=org-b`)
      .set("Authorization", "test")
      .expect(200);
    expect(service.getView).toHaveBeenCalledWith("org-a", expect.anything());
  });

  it("allows authenticated LEX employees to read their company view", async () => {
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", "test")
      .set("x-test-user", "employee")
      .expect(200);
    expect(service.getView).toHaveBeenCalledWith("org-a", "employee");
  });
  it("blocks access when LEX is not enabled for the company", async () => {
    prisma.organization.findUnique.mockResolvedValueOnce({
      modules: [],
      isAdminOrg: false,
    });
    await request(app.getHttpServer())
      .get(path)
      .set("Authorization", "test")
      .expect(403);
    expect(service.getView).not.toHaveBeenCalled();
  });
  it("exposes no mutation route", async () => {
    await request(app.getHttpServer())
      .post(path)
      .set("Authorization", "test")
      .send({})
      .expect(404);
  });
});
