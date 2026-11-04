// expect.objectContaining() is typed as any, which this rule flags in every matcher.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { SaveDraftDto } from './dto/strategic-direction.dto';
import { StrategicDirectionController } from './strategic-direction.controller';
import { StrategicDirectionService } from './strategic-direction.service';

const USER = {
  userId: 'user-1',
  organizationId: 'org-1',
  roleLevel: Role.ADMIN,
} as AccessTokenPayload;

const COMPLETE = {
  id: 'dir-1',
  organizationId: 'org-1',
  status: 'DRAFT',
  company: 'Gemba',
  business: 'Manufacturing',
  purpose: 'Purpose',
  vision: 'Vision',
  visionWhy: 'Why vision',
  mission: 'Mission',
  missionWhy: 'Why mission',
  // jsonb returns keys shortest-first, so stored values come back as id, why, name.
  values: [{ id: 'v-1', why: 'We own outcomes', name: 'Ownership' }],
  currentVersion: null,
};

function setup(draft: unknown = null, actor: unknown = { id: 'emp-1' }) {
  const prisma = {
    employee: { findFirst: jest.fn().mockResolvedValue(actor) },
    lexStrategicDirection: {
      findUnique: jest.fn().mockResolvedValue(draft),
      upsert: jest
        .fn()
        .mockImplementation(({ create, update }) =>
          Promise.resolve({ id: 'dir-1', ...(draft ? update : create) }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...(draft as object), ...data }),
        ),
    },
    lexStrategicDirectionEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const service = new StrategicDirectionService(
    prisma as unknown as PrismaService,
  );
  return { prisma, service };
}

describe('StrategicDirectionService', () => {
  describe('getDraft', () => {
    it('returns an empty draft without creating a row', async () => {
      const { prisma, service } = setup();
      await expect(service.getDraft('org-1')).resolves.toMatchObject({
        id: null,
        status: 'DRAFT',
        values: [],
      });
      expect(prisma.lexStrategicDirection.upsert).not.toHaveBeenCalled();
    });
  });

  describe('saveDraft', () => {
    it('creates the row and logs only the fields that changed', async () => {
      const { prisma, service } = setup();
      await service.saveDraft(USER, { company: '  Gemba  ' });

      expect(prisma.lexStrategicDirection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { organizationId: 'org-1', company: 'Gemba' },
        }),
      );
      expect(prisma.lexStrategicDirectionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DRAFT_SAVED',
          actorId: 'emp-1',
          changes: { company: { from: null, to: 'Gemba' } },
        }),
      });
    });

    it('writes nothing when the same text is saved again', async () => {
      const { prisma, service } = setup(COMPLETE);
      await service.saveDraft(USER, { company: 'Gemba' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('treats unchanged values as unchanged despite jsonb key order', async () => {
      const { prisma, service } = setup(COMPLETE);
      await service.saveDraft(USER, {
        values: [{ id: 'v-1', name: 'Ownership', why: 'We own outcomes' }],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears a field sent as null instead of crashing', async () => {
      const { prisma, service } = setup(COMPLETE);
      await service.saveDraft(USER, { vision: null as unknown as string });
      expect(prisma.lexStrategicDirection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { vision: null } }),
      );
    });

    it('gives new values an id and rejects duplicate ids', async () => {
      const { prisma, service } = setup(COMPLETE);
      await service.saveDraft(USER, {
        values: [{ name: 'Safety', why: 'Everyone home' }],
      });
      const [[{ update }]] = prisma.lexStrategicDirection.upsert.mock.calls as [
        [{ update: { values: { id: string }[] } }],
      ];
      expect(typeof update.values[0].id).toBe('string');

      await expect(
        service.saveDraft(USER, {
          values: [
            { id: 'v-1', name: 'A', why: 'a' },
            { id: 'v-1', name: 'B', why: 'b' },
          ],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it.each(['IN_REVIEW', 'APPROVED'])(
      'refuses edits while %s',
      async (status) => {
        const { service } = setup({ ...COMPLETE, status });
        await expect(
          service.saveDraft(USER, { company: 'X' }),
        ).rejects.toMatchObject({ status: 409 });
      },
    );

    it('logs a null actor when the user has no employee row', async () => {
      const { prisma, service } = setup(null, null);
      await service.saveDraft(USER, { company: 'Gemba' });
      expect(prisma.lexStrategicDirectionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actorId: null }),
      });
    });
  });

  describe('submit', () => {
    it('requires a saved draft', async () => {
      const { service } = setup();
      await expect(service.submit(USER)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('lists every missing field with its label', async () => {
      const { prisma, service } = setup({
        ...COMPLETE,
        vision: '   ',
        missionWhy: null,
        values: [{ id: 'v-1', name: 'Ownership', why: '' }],
      });
      const error = await service.submit(USER).catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 400 });
      expect(
        (error as { getResponse(): { problems: unknown } }).getResponse()
          .problems,
      ).toEqual([
        { field: 'vision', label: 'Vision' },
        { field: 'missionWhy', label: 'Why this mission?' },
        { field: 'v-1-why', label: 'Value 1 explanation' },
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires at least one core value', async () => {
      const { service } = setup({ ...COMPLETE, values: [] });
      const error = await service.submit(USER).catch((e: unknown) => e);
      expect(
        (error as { getResponse(): { problems: unknown } }).getResponse()
          .problems,
      ).toEqual([{ field: 'values', label: 'At least one core value' }]);
    });

    it('moves a complete draft to IN_REVIEW and logs SUBMITTED', async () => {
      const { prisma, service } = setup({
        ...COMPLETE,
        returnReason: 'Fix vision',
      });
      const saved = await service.submit(USER);

      expect(saved).toMatchObject({
        status: 'IN_REVIEW',
        submittedById: 'emp-1',
        returnReason: null,
      });
      expect(prisma.lexStrategicDirectionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SUBMITTED',
          directionId: 'dir-1',
          version: null,
        }),
      });
    });

    it('refuses to submit twice', async () => {
      const { service } = setup({ ...COMPLETE, status: 'IN_REVIEW' });
      await expect(service.submit(USER)).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});

describe('SaveDraftDto', () => {
  const errors = (body: object) =>
    validate(plainToInstance(SaveDraftDto, body));

  it('rejects text over the prototype limits', async () => {
    expect(await errors({ company: 'x'.repeat(151) })).toHaveLength(1);
    expect(await errors({ company: 'x'.repeat(150) })).toHaveLength(0);
  });

  it('validates each core value', async () => {
    expect(
      await errors({ values: [{ name: 'x'.repeat(51), why: 'ok' }] }),
    ).toHaveLength(1);
  });
});

describe('StrategicDirectionController roles', () => {
  const roles = (method: keyof StrategicDirectionController) =>
    Reflect.getMetadata(
      ROLES_KEY,
      StrategicDirectionController.prototype[method],
    ) as Role[];

  it('keeps drafts away from employees but shares the approved version', () => {
    expect(roles('getDraft')).not.toContain(Role.EMPLOYEE);
    expect(roles('saveDraft')).not.toContain(Role.EMPLOYEE);
    expect(roles('submit')).not.toContain(Role.EMPLOYEE);
    expect(roles('getApprovedDirection')).toContain(Role.EMPLOYEE);
  });

  it('includes SUPER_ADMIN on every route', () => {
    for (const method of [
      'getDraft',
      'getApprovedDirection',
      'saveDraft',
      'submit',
    ] as const) {
      expect(roles(method)).toContain(Role.SUPER_ADMIN);
    }
  });
});
