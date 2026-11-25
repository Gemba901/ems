import 'reflect-metadata';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { ModuleType } from 'db';
import { PerformanceIntelligenceController } from './performance-intelligence.controller';
import { IntelligenceQueryDto } from './dto/intelligence-query.dto';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { MODULE_KEY } from '../../auth/decorators/module.decorator';
import { TENANT_REQUIRED_KEY } from '../../tenancy/tenant-route.decorator';
import { LEX_ALL } from '../common/lex-roles';

jest.mock('../execution/execution.service', () => ({
  ExecutionService: class {},
}));
jest.mock('../performance-planning/performance-planning.service', () => ({
  PerformancePlanningService: class {},
}));

describe('Area 07 report routes', () => {
  test('dashboard, report and CSV share tenant, authentication, module and role checks', () => {
    expect(
      Reflect.getMetadata(
        TENANT_REQUIRED_KEY,
        PerformanceIntelligenceController,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(MODULE_KEY, PerformanceIntelligenceController),
    ).toBe(ModuleType.LEADERSHIP_EXCELLENCE);
    expect(
      Reflect.getMetadata(ROLES_KEY, PerformanceIntelligenceController),
    ).toEqual(LEX_ALL);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PerformanceIntelligenceController,
      ).map((guard: { name: string }) => guard.name),
    ).toEqual([
      'TrustedTenantContextGuard',
      'JwtAuthGuard',
      'TenantGuard',
      'RolesGuard',
      'ModuleGuard',
    ]);
    for (const [method, path] of [
      ['dashboard', 'dashboard'],
      ['reports', 'reports'],
      ['exportCsv', 'reports/export.csv'],
    ] as const) {
      const handler = PerformanceIntelligenceController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
    }
    expect(
      Reflect.getMetadata(
        HEADERS_METADATA,
        PerformanceIntelligenceController.prototype.exportCsv,
      ),
    ).toContainEqual({
      name: 'Content-Disposition',
      value: 'attachment; filename="performance-intelligence.csv"',
    });
  });

  test('all query routes use a strict shared validation pipe', async () => {
    const [pipe] = Reflect.getMetadata(
      PIPES_METADATA,
      PerformanceIntelligenceController,
    ) as ValidationPipe[];
    const metadata = { type: 'query' as const, metatype: IntelligenceQueryDto };
    await expect(
      pipe.transform({ scope: 'ORGANIZATION', rawState: true }, metadata),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ departmentId: ['a', 'b'] }, metadata),
    ).rejects.toThrow();
    expect(
      await pipe.transform({ cycle: '2026', scope: 'MY' }, metadata),
    ).toEqual({ cycle: '2026', scope: 'MY' });
  });

  test('dashboard and reports call the same service operation with their authenticated identity and filters', () => {
    const service = {
      getReport: jest.fn().mockReturnValue('projection'),
      exportCsv: jest.fn().mockReturnValue('csv'),
    };
    const controller = new PerformanceIntelligenceController(service as never);
    const user = { organizationId: 'tenant', userId: 'person' } as never;
    const filters = { cycle: '2026', search: 'Waste' };
    expect(controller.dashboard(user, filters)).toBe('projection');
    expect(controller.reports(user, filters)).toBe('projection');
    expect(service.getReport.mock.calls).toEqual([
      [user, filters],
      [user, filters],
    ]);
    expect(controller.exportCsv(user, filters)).toBe('csv');
    expect(service.exportCsv).toHaveBeenCalledWith(user, filters);
  });
});
