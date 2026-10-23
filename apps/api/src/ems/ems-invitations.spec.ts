import { BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  EmsInvitationsService, classifyInvitation, contactKey, endAccessForInactiveEmployee, hashInviteToken, invitePasswordProblem,
  type InviteCandidate,
} from './ems-invitations';

const person = (id: string, extra: Partial<InviteCandidate> = {}): InviteCandidate => ({
  id, firstName: id[0].toUpperCase() + id.slice(1), lastName: 'Test', employeeCode: id.toUpperCase(), employmentStatus: 'ACTIVE',
  email: `${id}@example.com`, phone: '+254700000' + String(100 + id.length), whatsappNumber: null, userId: `user-${id}`,
  user: { password: null }, emsInvitation: null, ...extra,
});
const now = new Date('2026-10-24T08:00:00Z');

describe('who gets which invitation', () => {
  const none = new Set<string>();
  it('sends a setup link to an active employee without a password', () => {
    expect(classifyInvitation(person('ann'), 'EMAIL', none, now, false)).toEqual({ category: 'SETUP', destination: 'ann@example.com' });
  });
  it('only notifies someone who already has a password', () => {
    expect(classifyInvitation(person('ann', { user: { password: 'hash' } }), 'EMAIL', none, now, false).category).toBe('ACCESS_NOTICE');
  });
  it('sends a notice without a link to a shared contact', () => {
    expect(classifyInvitation(person('ann'), 'EMAIL', new Set(['ann@example.com']), now, false).category).toBe('CONTACT_NOTICE');
  });
  it('skips inactive people, people without a contact, and people without an account, with reasons', () => {
    expect(classifyInvitation(person('ann', { employmentStatus: 'TERMINATED' }), 'EMAIL', none, now, false)).toEqual({ category: 'SKIPPED', reason: 'Inactive employee' });
    expect(classifyInvitation(person('ann', { email: null }), 'EMAIL', none, now, false)).toEqual({ category: 'SKIPPED', reason: 'No email address' });
    expect(classifyInvitation(person('ann', { phone: null }), 'WHATSAPP', none, now, false)).toEqual({ category: 'SKIPPED', reason: 'No WhatsApp or phone number' });
    expect(classifyInvitation(person('ann', { userId: null, user: null }), 'EMAIL', none, now, false).reason).toBe('No login account');
  });
  it('leaves valid pending and accepted invitations alone unless resending', () => {
    const pending = person('ann', { emsInvitation: { status: 'SENT', kind: 'SETUP', expiresAt: new Date('2026-10-30') } });
    expect(classifyInvitation(pending, 'EMAIL', none, now, false).category).toBe('PENDING');
    expect(classifyInvitation(pending, 'EMAIL', none, now, true).category).toBe('SETUP');
    const expired = person('ann', { emsInvitation: { status: 'SENT', kind: 'SETUP', expiresAt: new Date('2026-10-01') } });
    expect(classifyInvitation(expired, 'EMAIL', none, now, false).category).toBe('SETUP');
    expect(classifyInvitation(person('ann', { emsInvitation: { status: 'ACCEPTED', kind: 'SETUP', expiresAt: null } }), 'EMAIL', none, now, true).category).toBe('ACCEPTED');
  });
  it('compares numbers by their last nine digits', () => {
    expect(contactKey('WHATSAPP', '+254 712 345 678')).toBe(contactKey('WHATSAPP', '0712345678'));
    expect(contactKey('EMAIL', ' Ann@Example.com ')).toBe('ann@example.com');
  });
  it('applies the web password rules', () => {
    expect(invitePasswordProblem('short')).toMatch('12');
    expect(invitePasswordProblem('alllowercaseletters')).toMatch('three');
    expect(invitePasswordProblem('Abcdefghij12')).toBeNull();
  });
});

function setup(people: InviteCandidate[], channel = 'EMAIL') {
  const rows = new Map<string, any>();
  const prisma: any = {
    organization: { findUnique: jest.fn(async () => ({ communicationChannel: channel, name: 'Gemba Plastics' })) },
    employee: {
      count: jest.fn(async () => people.length),
      findMany: jest.fn(async ({ select }: any) => select?.user ? people : people.map(p => ({ email: p.email, phone: p.phone, whatsappNumber: p.whatsappNumber }))),
      findFirst: jest.fn(async ({ where }: any) => people.find(p => p.id === where.id) ? { id: where.id, userId: 'user-ann', employmentStatus: 'TERMINATED' } : null),
    },
    emsInvitation: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = rows.get(where.employeeId);
        rows.set(where.employeeId, row ? { ...row, ...update, sendCount: (row.sendCount ?? 1) + 1 } : { ...create });
      }),
      update: jest.fn(async ({ where, data }: any) => rows.set(where.employeeId, { ...rows.get(where.employeeId), ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(),
      findFirst: jest.fn(async () => null),
    },
    user: { updateMany: jest.fn(async () => ({ count: 1 })) },
    refreshToken: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const email = { send: jest.fn(async () => undefined) };
  const service = new EmsInvitationsService(prisma as unknown as PrismaService, email as any);
  return { service, prisma, rows, email };
}

describe('sending', () => {
  it('emails setup links and notices, records skips, and never stores the raw token', async () => {
    const { service, rows, email } = setup([person('ann'), person('ben', { user: { password: 'x' } }), person('cy', { email: null })]);
    const result = await service.send('org', 'hr', { employeeIds: ['ann', 'ben', 'cy'] }, 'https://acme.bees.example', 'acme.bees.example');
    expect(result).toMatchObject({ sent: 1, notices: 1, skipped: 1, failed: 0 });
    const link = (email.send.mock.calls as any[]).find(([p]) => p.to === 'ann@example.com')[0].actionUrl as string;
    expect(link).toMatch(/^https:\/\/acme\.bees\.example\/invite\?token=/);
    const token = new URL(link).searchParams.get('token')!;
    expect(rows.get('ann')).toMatchObject({ status: 'SENT', kind: 'SETUP', tokenHash: hashInviteToken(token) });
    expect(JSON.stringify([...rows.values()])).not.toContain(token);
    expect(rows.get('ben')).toMatchObject({ status: 'NOTICE_SENT', kind: 'ACCESS_NOTICE', tokenHash: null });
    expect(rows.get('cy')).toMatchObject({ status: 'SKIPPED', skipReason: 'No email address' });
  });

  it('prepares WhatsApp messages for HR to share instead of sending', async () => {
    const { service, rows, email } = setup([person('ann', { whatsappNumber: '+254712345678' })], 'WHATSAPP');
    const result = await service.send('org', 'hr', { employeeIds: ['ann'] }, 'http://acme.localhost:3000', 'acme.localhost');
    expect(email.send).not.toHaveBeenCalled();
    expect(result.share).toEqual([expect.objectContaining({ number: '+254712345678', kind: 'SETUP', message: expect.stringContaining('http://acme.localhost:3000/invite?token=') })]);
    expect(rows.get('ann').status).toBe('SHARED');
  });

  it('marks a failed email and switches its link off', async () => {
    const { service, rows, email } = setup([person('ann')]);
    email.send.mockRejectedValueOnce(new Error('SES rejected the address'));
    const result = await service.send('org', 'hr', { employeeIds: ['ann'] }, 'https://acme.bees.example', 'acme.bees.example');
    expect(result.failed).toBe(1);
    expect(rows.get('ann')).toMatchObject({ status: 'FAILED', tokenHash: null, lastError: 'SES rejected the address' });
  });

  it('refuses links to any address other than the verified company host', async () => {
    const { service } = setup([person('ann')]);
    await expect(service.send('org', 'hr', { employeeIds: ['ann'] }, 'https://evil.example', 'acme.bees.example')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.send('org', 'hr', { employeeIds: ['ann'] }, 'javascript:alert(1)', 'acme.bees.example')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a chosen channel and a selection', async () => {
    const none = setup([person('ann')], null as any);
    await expect(none.service.preview('org', { employeeIds: ['ann'] })).rejects.toThrow('communication channel');
    const empty = setup([]);
    await expect(empty.service.preview('org', {})).rejects.toThrow('Select employees');
  });
});

describe('accepting', () => {
  const invitation = (extra: any = {}) => ({ id: 'inv', organizationId: 'org', kind: 'SETUP', status: 'SENT', tokenHash: hashInviteToken('t'.repeat(40)),
    expiresAt: new Date(Date.now() + 86_400_000),
    employee: { firstName: 'Ann', lastName: 'Akinyi', employeeCode: 'A1', employmentStatus: 'ACTIVE', organizationId: 'org', userId: 'user-ann' }, ...extra });

  it('shows name and code for a valid link, and nothing for an invalid one', async () => {
    const { service, prisma } = setup([]);
    prisma.emsInvitation.findUnique.mockResolvedValueOnce(invitation());
    await expect(service.lookup('org', 'Gemba Plastics', 't'.repeat(40))).resolves.toEqual({ valid: true, organizationName: 'Gemba Plastics', name: 'Ann Akinyi', employeeCode: 'A1' });
    prisma.emsInvitation.findUnique.mockResolvedValueOnce(invitation({ organizationId: 'other' }));
    await expect(service.lookup('org', 'Gemba Plastics', 't'.repeat(40))).resolves.toMatchObject({ valid: false });
  });

  it('sets the password once and consumes the link in the same transaction', async () => {
    const { service, prisma } = setup([]);
    prisma.emsInvitation.findUnique.mockResolvedValue(invitation());
    await expect(service.accept('org', 't'.repeat(40), 'Abcdefghij12')).resolves.toEqual({ alreadyHadPassword: false });
    expect(prisma.emsInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED', tokenHash: null }) }));
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-ann', password: null } }));
  });

  it('rejects expired, used, inactive or other-company links, and weak passwords', async () => {
    const { service, prisma } = setup([]);
    for (const bad of [{ expiresAt: new Date(Date.now() - 1000) }, { status: 'ACCEPTED' }, { organizationId: 'other' },
      { employee: { ...invitation().employee, employmentStatus: 'TERMINATED' } }]) {
      prisma.emsInvitation.findUnique.mockResolvedValueOnce(invitation(bad));
      await expect(service.accept('org', 't'.repeat(40), 'Abcdefghij12')).rejects.toThrow('invalid or has expired');
    }
    await expect(service.accept('org', 't'.repeat(40), 'weak')).rejects.toThrow('12');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('treats a link used twice at once as invalid', async () => {
    const { service, prisma } = setup([]);
    prisma.emsInvitation.findUnique.mockResolvedValue(invitation());
    prisma.emsInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.accept('org', 't'.repeat(40), 'Abcdefghij12')).rejects.toThrow('invalid or has expired');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('becoming inactive', () => {
  it('cancels pending links and ends sessions in this organisation only', async () => {
    const { prisma } = setup([person('ann')]);
    await endAccessForInactiveEmployee(prisma, 'org', 'ann');
    expect(prisma.emsInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: 'ann', organizationId: 'org' }) }));
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-ann', organizationId: 'org' } });
  });
});
