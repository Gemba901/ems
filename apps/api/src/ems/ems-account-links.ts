import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/notifications/channels/email.service';
import { isActiveEmployment } from './employment-status';
import { storedPhone } from './onboarding-phone';
import { importedAccountRole } from './onboarding-access';
import { retryOnboardingTransaction } from './onboarding-transaction';

export const LINK_TTL_MS = 30 * 60 * 1000;
export const LINK_REQUIRED = 'Account verification required; no new login access has been granted';
export const INVALID_ACCOUNT_LINK = 'This account-verification link is unavailable or expired. Ask HR to review or resend it.';
export const accountLinkHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const accountEmail = (value: string | null | undefined) => {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ? email : null;
};
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const include = { user: true, employee: true, organization: { select: { name: true, status: true } }, role: { select: { name: true } } } satisfies Prisma.EmsAccountLinkInclude;
type Link = Prisma.EmsAccountLinkGetPayload<{ include: typeof include }>;

/** Called only inside registration's serializable transaction. Never sends messages. */
export async function createPendingAccountLink(db: Prisma.TransactionClient, organizationId: string, employeeId: string,
  user: { id: string; phone: string; email: string | null }, phone: string, importedEmail: string | null, roleId: number) {
  // Bind provenance before granting A any membership. Never source this from A's new row.
  const original = accountEmail(user.email) ? null : await db.employee.findFirst({
    where: { userId: user.id, organizationId: { not: organizationId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, email: true, employmentStatus: true },
  });
  const destination = accountEmail(user.email) ?? (original && isActiveEmployment(original.employmentStatus) ? accountEmail(original.email) : null);
  await db.emsAccountLink.create({ data: { employeeId, organizationId, userId: user.id, roleId,
    requestedPhone: phone, importedEmail, destination,
    sourceKind: accountEmail(user.email) ? 'USER_EMAIL' : original ? 'EMPLOYEE_EMAIL' : null,
    sourceEmployeeId: original?.id ?? null,
    contactMatches: destination ? accountEmail(importedEmail) === destination : null,
  } });
  await db.emsInvitation.create({ data: { employeeId, organizationId, userId: null,
    kind: 'ACCOUNT_LINK', channel: 'EMAIL', status: 'SKIPPED', skipReason: LINK_REQUIRED } });
}

@Injectable()
export class EmsAccountLinksService {
  constructor(private db: PrismaService, @Optional() private email?: EmailService) {}

  private async destination(db: Pick<Prisma.TransactionClient, 'employee' | 'user'>, row: Link) {
    let value: string | null = null;
    if (row.sourceKind === 'USER_EMAIL') value = accountEmail(row.user.email);
    if (row.sourceKind === 'EMPLOYEE_EMAIL' && row.sourceEmployeeId) {
      const original = await db.employee.findFirst({ where: { id: row.sourceEmployeeId, userId: row.userId, organizationId: { not: row.organizationId } },
        select: { email: true, employmentStatus: true } });
      if (original && isActiveEmployment(original.employmentStatus)) value = accountEmail(original.email);
    }
    if (!value) return null;
    // A shared mailbox is not sufficient proof of one person's account ownership.
    const shared = await db.employee.findFirst({ where: {
      id: { not: row.employeeId }, email: { equals: value, mode: 'insensitive' },
      OR: [{ userId: null }, { userId: { not: row.userId } }],
    }, select: { id: true } });
    const anotherLogin = await db.user.findFirst({ where: { id: { not: row.userId }, email: { equals: value, mode: 'insensitive' } }, select: { id: true } });
    return shared || anotherLogin ? null : value;
  }

  private eligible(row: Link) {
    return row.employee.organizationId === row.organizationId && row.organization.status === 'ACTIVE'
      && row.employee.userId === null && isActiveEmployment(row.employee.employmentStatus)
      && storedPhone(row.employee.phone) === row.requestedPhone && storedPhone(row.user.phone) === row.requestedPhone
      && importedAccountRole(row.employee.beesAccessLevel) === row.role.name;
  }

  async preview(organizationId: string, employeeId: string, resend: boolean) {
    const row = await this.db.emsAccountLink.findUnique({ where: { employeeId }, include });
    if (!row || row.organizationId !== organizationId) return null;
    if (row.status === 'ACCEPTED') return { category: 'ACCEPTED' as const };
    if (row.status === 'DECLINED') return { category: 'SKIPPED' as const, reason: 'The person declined account linking; HR review required' };
    if (!this.eligible(row)) return { category: 'SKIPPED' as const, reason: 'Account or employee details changed; HR review required' };
    if (!await this.destination(this.db, row)) return { category: 'SKIPPED' as const, reason: 'No usable existing account email; secure recovery with the existing account administrator is required' };
    if (!resend && ['SENT', 'VERIFIED'].includes(row.status) && row.expiresAt && row.expiresAt > new Date()) return { category: 'PENDING' as const };
    if (!this.email) return { category: 'SKIPPED' as const, reason: 'Direct verification email is unavailable' };
    return { category: 'ACCOUNT_LINK' as const };
  }

  async send(organizationId: string, employeeId: string, actorUserId: string, origin: string, resend: boolean) {
    const decision = await this.preview(organizationId, employeeId, resend);
    if (!decision || decision.category !== 'ACCOUNT_LINK') return decision;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = accountLinkHash(token), now = new Date();
    const prepared = await retryOnboardingTransaction(() => this.db.$transaction(async tx => {
      const row = await tx.emsAccountLink.findUnique({ where: { employeeId }, include });
      if (!row || row.organizationId !== organizationId || ['ACCEPTED', 'DECLINED'].includes(row.status) || !this.eligible(row)) throw new BadRequestException(INVALID_ACCOUNT_LINK);
      if (!resend && row.expiresAt && row.expiresAt > now && ['SENT', 'VERIFIED'].includes(row.status)) throw new BadRequestException('An account verification is already pending');
      const destination = await this.destination(tx, row);
      if (!destination) throw new BadRequestException('Existing account contact requires administrator review');
      const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
      await tx.emsAccountLink.update({ where: { employeeId }, data: { destination, tokenHash, expiresAt,
        status: 'SENT', sentById: actorUserId, sentAt: now, verifiedAt: null, verificationMethod: null,
        importedEmail: row.employee.email, contactMatches: accountEmail(row.employee.email) === destination } });
      // HR gets only a status; no token, other-company name, address or password.
      await tx.emsInvitation.update({ where: { employeeId }, data: { kind: 'ACCOUNT_LINK', channel: 'EMAIL',
        status: 'SENT', userId: null, destination: null, tokenHash: null, expiresAt, sentAt: now, sentById: actorUserId,
        sendCount: { increment: 1 }, skipReason: null, lastError: null, cancelledAt: null } });
      return { destination, organizationName: row.organization.name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    try {
      await this.email!.send({ to: prepared.destination, subject: 'BEES account access request', title: 'Verify and review company access',
        message: `${escape(prepared.organizationName)} has requested to link an employee record to your existing BEES account. Verify this email, then choose whether to accept. If this is not you, decline. The link expires in 30 minutes.`,
        actionUrl: `${origin}/invite#account-link=${token}`, actionLabel: 'Review access request' }, { requireDelivery: true });
      return { category: 'ACCOUNT_LINK' as const };
    } catch {
      await this.db.$transaction(async tx => {
        const changed = await tx.emsAccountLink.updateMany({ where: { employeeId, tokenHash, status: 'SENT' }, data: { status: 'FAILED', tokenHash: null, expiresAt: null } });
        if (changed.count) await tx.emsInvitation.update({ where: { employeeId }, data: { status: 'FAILED', lastError: 'Direct verification email could not be delivered', expiresAt: null } });
      });
      return { category: 'SKIPPED' as const, reason: 'Direct verification email could not be delivered', failed: true };
    }
  }

  private async usable(db: Prisma.TransactionClient | PrismaService, organizationId: string, token: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = await db.emsAccountLink.findUnique({ where: { tokenHash: accountLinkHash(token) }, include });
    if (!row || row.organizationId !== organizationId || !['SENT', 'VERIFIED'].includes(row.status)
      || !row.expiresAt || row.expiresAt <= new Date() || !this.eligible(row)) return null;
    if (!row.destination || await this.destination(db, row) !== row.destination) return null;
    return row;
  }

  async lookup(organizationId: string, token: string) {
    const row = await this.usable(this.db, organizationId, token);
    if (!row) return { valid: false as const, message: INVALID_ACCOUNT_LINK };
    return { valid: true as const, organizationName: row.organization.name,
      name: `${row.employee.firstName} ${row.employee.lastName}`, employeeCode: row.employee.employeeCode,
      verified: !!row.verifiedAt, hasPassword: !!row.user.password };
  }

  async verify(organizationId: string, token: string) {
    await retryOnboardingTransaction(() => this.db.$transaction(async tx => {
      const row = await this.usable(tx, organizationId, token);
      if (!row) throw new BadRequestException(INVALID_ACCOUNT_LINK);
      await tx.emsAccountLink.update({ where: { employeeId: row.employeeId }, data: {
        status: 'VERIFIED', verifiedAt: row.verifiedAt ?? new Date(), verificationMethod: 'DIRECT_EMAIL_LINK',
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return this.lookup(organizationId, token);
  }

  async accept(organizationId: string, token: string, consent: boolean, password: string) {
    if (consent !== true) throw new BadRequestException('Explicit acceptance of company access is required');
    const initial = await this.usable(this.db, organizationId, token);
    if (!initial?.verifiedAt) throw new BadRequestException('Verify your existing email first');
    if (typeof password !== 'string' || password.length > 200) throw new BadRequestException('Enter your password');
    if (initial.user.password) {
      if (!await bcrypt.compare(password, initial.user.password)) throw new BadRequestException('Password could not be confirmed');
    } else {
      const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
      if (password.length < 12 || classes < 3) throw new BadRequestException('Use 12+ characters with at least three of: capitals, small letters, numbers and symbols');
    }
    const hashed = initial.user.password ? null : await bcrypt.hash(password, 10);
    await retryOnboardingTransaction(() => this.db.$transaction(async tx => {
      const row = await this.usable(tx, organizationId, token);
      if (!row?.verifiedAt || row.user.password !== initial.user.password || row.destination !== initial.destination) throw new BadRequestException(INVALID_ACCOUNT_LINK);
      // Protect the requested account; the new import never supplied this email.
      if (hashed) {
        const set = await tx.user.updateMany({ where: { id: row.userId, password: null }, data: { password: hashed } });
        if (set.count !== 1) throw new BadRequestException('Account changed; reopen your verification link');
      }
      const employee = await tx.employee.updateMany({ where: { id: row.employeeId, organizationId, userId: null, phone: row.employee.phone, beesAccessLevel: row.employee.beesAccessLevel, employmentStatus: row.employee.employmentStatus }, data: { userId: row.userId } });
      if (employee.count !== 1) throw new BadRequestException(INVALID_ACCOUNT_LINK);
      // Existing organisation roles are preserved. Never overwrite an existing membership.
      await tx.userOrganization.upsert({ where: { userId_organizationId: { userId: row.userId, organizationId } },
        update: {}, create: { userId: row.userId, organizationId, roleId: row.roleId } });
      const now = new Date();
      await tx.emsAccountLink.update({ where: { employeeId: row.employeeId }, data: { status: 'ACCEPTED', acceptedAt: now, tokenHash: null } });
      await tx.emsInvitation.update({ where: { employeeId: row.employeeId }, data: { status: 'ACCEPTED', acceptedAt: now, userId: row.userId, skipReason: null, expiresAt: null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return { accepted: true };
  }

  async decline(organizationId: string, token: string) {
    await retryOnboardingTransaction(() => this.db.$transaction(async tx => {
      const row = await this.usable(tx, organizationId, token);
      if (!row) throw new BadRequestException(INVALID_ACCOUNT_LINK);
      await tx.emsAccountLink.update({ where: { employeeId: row.employeeId }, data: { status: 'DECLINED', declinedAt: new Date(), tokenHash: null, expiresAt: null } });
      await tx.emsInvitation.update({ where: { employeeId: row.employeeId }, data: { status: 'SKIPPED', expiresAt: null, skipReason: 'The person declined account linking; HR review required' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    return { declined: true };
  }
}
