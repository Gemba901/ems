import { Test } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaModule } from "src/prisma/prisma.module";
import { PrismaService } from "src/prisma/prisma.service";
import { TenancyModule } from "src/tenancy/tenancy.module";
import { JwtStrategy } from "src/auth/jwt.strategy";
import { ModuleType, OrgStatus } from "db";
import { Role } from "src/common/enum/role.enum";
import { EmsOrgChartController } from "./org-chart.controller";
import { EmsOrgChartService } from "./org-chart.service";
describe("Org chart HTTP permissions", () => {
  let app: INestApplication;
  const secret = "org-chart-test-jwt-secret";
  const proxy = "c".repeat(64);
  const original = process.env.JWT_SECRET;
  const jwt = new JwtService({ secret, signOptions: { expiresIn: "5m" } });
  const read = jest.fn().mockResolvedValue({ people: [], issues: [] });
  const db = {
    organization: { findUnique: jest.fn() },
    userOrganization: { findUnique: jest.fn() },
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, TenancyModule],
      controllers: [EmsOrgChartController],
      providers: [
        JwtStrategy,
        { provide: EmsOrgChartService, useValue: { read } },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          TENANT_BASE_DOMAIN: "gembapms.co.in",
          TENANT_PROXY_SECRET: proxy,
        }),
      )
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });
  beforeEach(() => {
    read.mockClear();
    db.organization.findUnique.mockResolvedValue({
      id: "org-one",
      slug: "acme",
      name: "Acme",
      status: OrgStatus.ACTIVE,
      modules: [ModuleType.EMS],
      isAdminOrg: false,
    });
    db.userOrganization.findUnique.mockResolvedValue({
      roleId: 1,
      role: { name: Role.EMPLOYEE },
      organization: { status: OrgStatus.ACTIVE, isAdminOrg: false },
    });
  });
  const send = (org = "org-one", claimedRole = Role.EMPLOYEE) =>
    request(app.getHttpServer())
      .get("/ems/organisation/chart")
      .set("x-gemba-proxy-secret", proxy)
      .set("x-gemba-tenant-hostname", "acme.gembapms.co.in")
      .set(
        "Authorization",
        `Bearer ${jwt.sign({ tokenType: "ACCESS", userId: "u", organizationId: org, roleId: 1, roleLevel: claimedRole, email: null, isAdminOrg: false })}`,
      );
  it("allows ordinary employees within their company", async () => {
    await send().expect(200);
    expect(read).toHaveBeenCalledWith("org-one", Role.EMPLOYEE);
  });
  it("uses the current membership role after an HR token has been downgraded", async () => {
    const response = await send("org-one", Role.HR).expect(200);
    expect(read).toHaveBeenCalledWith("org-one", Role.EMPLOYEE);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects a valid other-company token", async () => {
    await send("org-two").expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects revoked membership", async () => {
    db.userOrganization.findUnique.mockResolvedValue(null);
    await send().expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects disabled EMS", async () => {
    db.organization.findUnique.mockResolvedValue({
      id: "org-one",
      slug: "acme",
      name: "Acme",
      status: OrgStatus.ACTIVE,
      modules: [],
      isAdminOrg: false,
    });
    await send().expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects an untrusted host request", async () => {
    await request(app.getHttpServer())
      .get("/ems/organisation/chart")
      .expect(401);
    expect(read).not.toHaveBeenCalled();
  });
});
