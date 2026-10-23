import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/notifications/channels/email.service';
import { isActiveEmployment } from './employment-status';
import { employeeListWhere } from './ems-employee-list';
import type { QueryEmsEmployeesDto } from './dto/ems.dto';

/**
 * Account invitations for registered employees.
 * The system decides what each person receives; HR only chooses who.
 *  - SETUP: no password yet → a single-use link (7 days) to create one.
 *  - ACCESS_NOTICE: already has a password (e.g. another company) → a notice to sign in; no link.
 *  - CONTACT_NOTICE: the email/number is shared with another employee → a notice only, because
 *    a set-password link there could be used by someone else. HR sets up access in person.
 * Only a hash of each link token is stored, as with password resets.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INVITE_SELECTION = 2000;
export type InviteChannel = 'EMAIL' | 'WHATSAPP';
export type InviteKind = 'SETUP' | 'ACCESS_NOTICE' | 'CONTACT_NOTICE';
export type InviteCategory = InviteKind | 'PENDING' | 'ACCEPTED' | 'SKIPPED';
const PENDING = ['SENT', 'SHARED'];
const INVALID_LINK = 'This invitation link is invalid or has expired. Ask HR to send a new one.';

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Matches the web's password rules: 12+ characters and at least three of: upper, lower, digit, symbol. */
export function invitePasswordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(rule => rule.test(password)).length;
  return classes >= 3 ? null : 'Mix at least three of: capital letters, small letters, numbers and symbols.';
}

/** Where an invitation for this channel goes: the employee's email, or WhatsApp number (falling back to phone). */
export function inviteDestination(channel: InviteChannel, e: { email?: string | null; phone?: string | null; whatsappNumber?: string | null }) {
  if (channel === 'EMAIL') return e.email?.trim().toLowerCase() || null;
  return e.whatsappNumber?.trim() || e.phone?.trim() || null;
}
/** Comparable form of a contact: lower-case email, or the last nine digits of a number. */
export function contactKey(channel: InviteChannel, value: string | null) {
  if (!value) return null;
  if (channel === 'EMAIL') return value.trim().toLowerCase();
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits || null;
}

export type InviteCandidate = {
  id: string; firstName: string; lastName: string; employeeCode: string | null; employmentStatus: string;
  email: string | null; phone: string | null; whatsappNumber: string | null; userId: string | null;
  user: { password: string | null } | null;
  emsInvitation: { status: string; kind: string; expiresAt: Date | null } | null;
};

/** What this person would receive, or why not. `sharedKeys` holds contacts used by more than one employee. */
export function classifyInvitation(e: InviteCandidate, channel: InviteChannel, sharedKeys: Set<string>, now: Date, resend: boolean):
  { category: InviteCategory; reason?: string; destination?: string } {
  const current = e.emsInvitation;
  if (current?.status === 'ACCEPTED') return { category: 'ACCEPTED' };
  if (!resend && current && PENDING.includes(current.status) && current.expiresAt && current.expiresAt > now) return { category: 'PENDING' };
  if (!isActiveEmployment(e.employmentStatus)) return { category: 'SKIPPED', reason: 'Inactive employee' };
  if (!e.userId || !e.user) return { category: 'SKIPPED', reason: 'No login account' };
  const destination = inviteDestination(channel, e);
  if (!destination) return { category: 'SKIPPED', reason: channel === 'EMAIL' ? 'No email address' : 'No WhatsApp or phone number' };
  const key = contactKey(channel, destination);
  if (key && sharedKeys.has(key)) return { category: 'CONTACT_NOTICE', destination };
  return { category: e.user.password ? 'ACCESS_NOTICE' : 'SETUP', destination };
}

/** Message text per kind. The link is only part of SETUP and ACCESS_NOTICE messages. */
export function inviteMessage(kind: InviteKind, name: string, organization: string, link: string | null) {
  if (kind === 'SETUP') return { subject: `Set up your ${organization} account`, label: 'Create your password',
    text: `Hello ${name}, ${organization} has set up your BEES account. Create your password using this link (valid for 7 days, use once): ${link}` };
  if (kind === 'ACCESS_NOTICE') return { subject: `You've been added to ${organization}`, label: 'Sign in',
    text: `Hello ${name}, you've been added to ${organization} on BEES. Sign in with your existing password: ${link}` };
  return { subject: `An account was created for you at ${organization}`, label: undefined,
    text: `Hello ${name}, an account was created for you at ${organization} on BEES. This contact is shared, so ask HR to set up your access in person.` };
}

export type InvitationSelection = {
  employeeIds?: string[];
  filters?: Partial<QueryEmsEmployeesDto>;
  resend?: boolean;
};

const CANDIDATE_SELECT = {
  id: true, firstName: true, lastName: true, employeeCode: true, employmentStatus: true,
  email: true, phone: true, whatsappNumber: true, userId: true,
  user: { select: { password: true } },
  emsInvitation: { select: { status: true, kind: true, expiresAt: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmsInvitationsService {
  constructor(private prisma: PrismaService, @Optional() private email?: EmailService) {}

  private async channel(organizationId: string): Promise<InviteChannel> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { communicationChannel: true } });
    if (!org) throw new NotFoundException('Organisation not found');
    if (org.communicationChannel !== 'EMAIL' && org.communicationChannel !== 'WHATSAPP')
      throw new BadRequestException('Choose the organisation’s communication channel (WhatsApp or email) before sending invitations.');
    return org.communicationChannel;
  }

  private selectionWhere(organizationId: string, selection: InvitationSelection): Prisma.EmployeeWhereInput {
    const ids = selection.employeeIds?.filter(id => typeof id === 'string' && id);
    if (ids?.length) {
      if (ids.length > MAX_INVITE_SELECTION) throw new BadRequestException(`Select at most ${MAX_INVITE_SELECTION} employees at once.`);
      return { organizationId, id: { in: ids } };
    }
    if (selection.filters) return employeeListWhere(organizationId, { ...selection.filters, page: 1, limit: 20 } as QueryEmsEmployeesDto);
    throw new BadRequestException('Select employees to invite.');
  }

  private async candidates(organizationId: string, selection: InvitationSelection) {
    const where = this.selectionWhere(organizationId, selection);
    const count = await this.prisma.employee.count({ where });
    if (count > MAX_INVITE_SELECTION) throw new BadRequestException(`That selection has ${count} employees. Invite at most ${MAX_INVITE_SELECTION} at once.`);
    return this.prisma.employee.findMany({ where, select: CANDIDATE_SELECT, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }] });
  }

  /** Contacts used by more than one employee in the organisation, for this channel. */
  private async sharedKeys(organizationId: string, channel: InviteChannel) {
    const all = await this.prisma.employee.findMany({ where: { organizationId }, select: { email: true, phone: true, whatsappNumber: true } });
    const counts = new Map<string, number>();
    for (const e of all) { const key = contactKey(channel, inviteDestination(channel, e)); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); }
    return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
  }

  async preview(organizationId: string, selection: InvitationSelection) {
    const [channel, people] = await Promise.all([this.channel(organizationId), this.candidates(organizationId, selection)]);
    const shared = await this.sharedKeys(organizationId, channel);
    const now = new Date();
    const counts: Record<InviteCategory, number> = { SETUP: 0, ACCESS_NOTICE: 0, CONTACT_NOTICE: 0, PENDING: 0, ACCEPTED: 0, SKIPPED: 0 };
    const skipped: { employeeId: string; name: string; reason: string }[] = [];
    for (const e of people) {
      const result = classifyInvitation(e, channel, shared, now, !!selection.resend);
      counts[result.category]++;
      if (result.category === 'SKIPPED') skipped.push({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`.trim(), reason: result.reason! });
    }
    return { channel, total: people.length, counts, skipped: skipped.slice(0, 200) };
  }

  /**
   * Send (email) or prepare (WhatsApp: HR shares from their own phone) each person's invitation.
   * `origin` is the company web address the HR user is on; it must match the verified company host.
   */
  async send(organizationId: string, actorUserId: string, selection: InvitationSelection, origin: string, tenantHost: string | undefined) {
    let base: URL;
    try { base = new URL(origin); } catch { throw new BadRequestException('Invalid web address for invitation links.'); }
    if (!tenantHost || base.hostname.toLowerCase() !== tenantHost.toLowerCase() || !/^https?:$/.test(base.protocol))
      throw new BadRequestException('Send invitations from your company’s BEES address.');
    const channel = await this.channel(organizationId);
    if (channel === 'EMAIL' && !this.email) throw new BadRequestException('Email sending is not available.');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const people = await this.candidates(organizationId, selection);
    const shared = await this.sharedKeys(organizationId, channel);
    const now = new Date();
    const result = { channel, sent: 0, shared: 0, notices: 0, failed: 0, skipped: 0, unchanged: 0,
      share: [] as { employeeId: string; name: string; number: string; kind: InviteKind; message: string }[],
      inPerson: [] as { employeeId: string; name: string }[], failures: [] as { employeeId: string; name: string; error: string }[] };

    for (const e of people) {
      const name = `${e.firstName} ${e.lastName}`.trim();
      const decision = classifyInvitation(e, channel, shared, now, !!selection.resend);
      const common = { organizationId, userId: e.userId, channel, sentById: actorUserId };
      if (decision.category === 'PENDING' || decision.category === 'ACCEPTED') { result.unchanged++; continue; }
      if (decision.category === 'SKIPPED') {
        result.skipped++;
        await this.prisma.emsInvitation.upsert({ where: { employeeId: e.id },
          create: { ...common, employeeId: e.id, kind: 'SETUP', status: 'SKIPPED', skipReason: decision.reason },
          update: { ...common, status: 'SKIPPED', skipReason: decision.reason, tokenHash: null, expiresAt: null, lastError: null } });
        continue;
      }
      const kind = decision.category;
      const token = kind === 'SETUP' ? randomBytes(32).toString('base64url') : null;
      const link = kind === 'SETUP' ? `${base.origin}/invite?token=${token}` : kind === 'ACCESS_NOTICE' ? `${base.origin}/login` : null;
      const message = inviteMessage(kind, e.firstName, org?.name ?? 'Your company', link);
      const status = kind === 'SETUP' ? (channel === 'EMAIL' ? 'SENT' : 'SHARED') : 'NOTICE_SENT';
      const data = { ...common, kind, status, destination: decision.destination, skipReason: null, lastError: null,
        tokenHash: token ? hashInviteToken(token) : null, expiresAt: token ? new Date(now.getTime() + INVITE_TTL_MS) : null,
        sentAt: now, acceptedAt: null, cancelledAt: null };
      await this.prisma.emsInvitation.upsert({ where: { employeeId: e.id },
        create: { ...data, employeeId: e.id, sendCount: 1 }, update: { ...data, sendCount: { increment: 1 } } });
      if (kind === 'CONTACT_NOTICE') result.inPerson.push({ employeeId: e.id, name });
      if (channel === 'WHATSAPP') {
        result.share.push({ employeeId: e.id, name, number: decision.destination!, kind, message: message.text });
        if (kind === 'SETUP') result.shared++; else result.notices++;
        continue;
      }
      try {
        await this.email!.send({ to: decision.destination!, subject: message.subject, title: message.subject, message: message.text,
          ...(link ? { actionUrl: link, actionLabel: message.label } : {}) }, { requireDelivery: true });
        if (kind === 'SETUP') result.sent++; else result.notices++;
      } catch (error) {
        result.failed++;
        const text = error instanceof Error ? error.message.slice(0, 480) : 'Email could not be sent';
        result.failures.push({ employeeId: e.id, name, error: text });
        // A link that never arrived must not stay usable.
        await this.prisma.emsInvitation.update({ where: { employeeId: e.id }, data: { status: 'FAILED', lastError: text, tokenHash: null } });
      }
    }
    return result;
  }

  async getForEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    const invitation = await this.prisma.emsInvitation.findFirst({ where: { employeeId, organizationId },
      select: { kind: true, channel: true, status: true, destination: true, skipReason: true, lastError: true, expiresAt: true,
        sendCount: true, sentAt: true, acceptedAt: true, cancelledAt: true } });
    return { invitation };
  }

  /** Switch off a link that was sent: it stops working immediately. */
  async cancel(organizationId: string, employeeId: string) {
    const changed = await this.prisma.emsInvitation.updateMany({
      where: { employeeId, organizationId, status: { in: PENDING } },
      data: { status: 'CANCELLED', tokenHash: null, cancelledAt: new Date() },
    });
    if (!changed.count) throw new BadRequestException('There is no pending invitation to cancel.');
    return this.getForEmployee(organizationId, employeeId);
  }

  private async usable(organizationId: string, token: unknown) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const invitation = await this.prisma.emsInvitation.findUnique({ where: { tokenHash: hashInviteToken(token) },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, employmentStatus: true, organizationId: true, userId: true } } } });
    if (!invitation || invitation.organizationId !== organizationId || invitation.employee.organizationId !== organizationId) return null;
    if (invitation.kind !== 'SETUP' || !PENDING.includes(invitation.status) || !invitation.expiresAt || invitation.expiresAt <= new Date()) return null;
    if (!isActiveEmployment(invitation.employee.employmentStatus) || !invitation.employee.userId) return null;
    return invitation;
  }

  /** Public: who the link is for, so the person can confirm it's them. Reveals nothing for a bad link. */
  async lookup(organizationId: string, organizationName: string, token: unknown) {
    const invitation = await this.usable(organizationId, token);
    if (!invitation) return { valid: false as const, message: INVALID_LINK };
    const e = invitation.employee;
    return { valid: true as const, organizationName, name: `${e.firstName} ${e.lastName}`.trim(), employeeCode: e.employeeCode };
  }

  /** Public: create the password. The link is consumed in the same transaction, so it works once. */
  async accept(organizationId: string, token: unknown, newPassword: unknown) {
    const problem = invitePasswordProblem(newPassword);
    if (problem) throw new BadRequestException(problem);
    const invitation = await this.usable(organizationId, token);
    if (!invitation) throw new BadRequestException(INVALID_LINK);
    const hashed = await bcrypt.hash(newPassword as string, 10);
    return this.prisma.$transaction(async tx => {
      const consumed = await tx.emsInvitation.updateMany({
        where: { id: invitation.id, tokenHash: invitation.tokenHash, status: { in: PENDING } },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), tokenHash: null },
      });
      if (consumed.count !== 1) throw new BadRequestException(INVALID_LINK);
      // Never replace a password set some other way in the meantime.
      const set = await tx.user.updateMany({ where: { id: invitation.employee.userId!, password: null }, data: { password: hashed } });
      return { alreadyHadPassword: set.count === 0 };
    });
  }
}

/** When someone becomes inactive: cancel pending invitation links and end their sessions in this organisation. */
export async function endAccessForInactiveEmployee(prisma: PrismaService, organizationId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: { userId: true, employmentStatus: true } });
  if (!employee || isActiveEmployment(employee.employmentStatus)) return;
  await prisma.emsInvitation.updateMany({ where: { employeeId, organizationId, status: { in: PENDING } },
    data: { status: 'CANCELLED', tokenHash: null, cancelledAt: new Date(), lastError: 'Employee became inactive' } });
  if (employee.userId) await prisma.refreshToken.deleteMany({ where: { userId: employee.userId, organizationId } });
}
