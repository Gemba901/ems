import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { Prisma, EmsEmploymentStatusChange } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { DwmsService } from 'src/dwms/dwms.service';
import { ChangeEmploymentStatusDto, EmploymentStatusDto } from './dto/ems.dto';
import { employmentActivityState } from './employment-status';
import { retryOnboardingTransaction } from './onboarding-transaction';

const logger = new Logger('EmsEmploymentStatus');
const employeeSelect = { id: true, employmentStatus: true, employmentStatusRevision: true, updatedAt: true, departmentId: true, jobTitle: true } as const;
const publicChange = (change: EmsEmploymentStatusChange) => ({
  id: change.id, fromStatus: change.fromStatus, toStatus: change.toStatus,
  reason: change.reason, actorName: change.actorName, actorUserId: change.actorUserId,
  source: change.source, changedAt: change.changedAt, activitySync: change.activitySync,
});

export async function getEmploymentStatus(prisma: PrismaService, organizationId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: employeeSelect });
  if (!employee) throw new NotFoundException('Employee not found');
  const changes = await prisma.emsEmploymentStatusChange.findMany({
    where: { employeeId, organizationId }, orderBy: [{ changedAt: 'desc' }, { revision: 'desc' }], take: 21,
  });
  const latest = changes[0];
  const syncOutstanding = latest && latest.revision === employee.employmentStatusRevision && latest.toStatus === employee.employmentStatus && latest.activitySync !== 'SYNCED';
  return {
    status: employee.employmentStatus, activityState: employmentActivityState(employee.employmentStatus),
    revision: employee.employmentStatusRevision, updatedAt: employee.updatedAt,
    syncChangeId: syncOutstanding ? latest.id : null,
    activitySync: syncOutstanding ? latest.activitySync : null,
    history: changes.slice(0, 20).map(publicChange), hasMoreHistory: changes.length > 20,
  };
}

// Kept separate from the committed status change. A failed downstream call must
// never be reported as though the employee's new status was not saved.
async function synchronize(prisma: PrismaService, dwms: DwmsService | undefined, organizationId: string, employeeId: string, change: EmsEmploymentStatusChange) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: employeeSelect });
  if (!employee) throw new NotFoundException('Employee not found');
  if (change.revision !== employee.employmentStatusRevision || change.toStatus !== employee.employmentStatus) return;
  if (change.activitySync === 'SYNCED') return;
  let activitySync = dwms ? 'SYNCED' : 'UNAVAILABLE';
  if (dwms) {
    try {
      await dwms.synchronizeEmployeeActivities(organizationId, employeeId, {
        previousDepartmentId: change.previousDepartmentId,
        previousJobTitle: change.previousJobTitle,
        previousEmploymentStatus: change.fromStatus,
      });
    } catch {
      activitySync = 'FAILED';
      logger.warn(`Activity synchronization failed after saved status change ${change.id}; retry is available.`);
    }
  }
  try {
    await prisma.emsEmploymentStatusChange.updateMany({ where: { id: change.id, organizationId, employeeId }, data: { activitySync } });
  } catch {
    // It remains PENDING, so a successful save is still recoverable after a log-write failure.
    logger.warn(`Could not record activity synchronization result for status change ${change.id}.`);
  }
}

export async function changeEmploymentStatus(prisma: PrismaService, dwms: DwmsService | undefined, organizationId: string, employeeId: string, actorUserId: string, dto: ChangeEmploymentStatusDto) {
  if (!actorUserId) throw new UnauthorizedException();
  const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
  if (!Object.values(EmploymentStatusDto).includes(dto.status) || reason.length < 3 || reason.length > 500 ||
      !Number.isInteger(dto.expectedRevision) || dto.expectedRevision < 0 ||
      !Number.isFinite(Date.parse(dto.expectedUpdatedAt)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dto.requestId)) {
    throw new BadRequestException('Choose a valid status, give a reason of 3–500 characters, and reload the current status before confirming.');
  }
  const change = await retryOnboardingTransaction(() => prisma.$transaction(async tx => {
    const existing = await tx.emsEmploymentStatusChange.findUnique({ where: { organizationId_requestId: { organizationId, requestId: dto.requestId } } });
    if (existing) {
      if (existing.employeeId !== employeeId || existing.actorUserId !== actorUserId || existing.toStatus !== dto.status ||
          existing.reason !== reason || existing.revision !== dto.expectedRevision + 1 || existing.expectedUpdatedAt.toISOString() !== new Date(dto.expectedUpdatedAt).toISOString()) {
        throw new ConflictException('This confirmation key was already used for another change. Reload and review the current status.');
      }
      return existing;
    }
    const current = await tx.employee.findFirst({ where: { id: employeeId, organizationId }, select: employeeSelect });
    if (!current) throw new NotFoundException('Employee not found');
    if (current.employmentStatusRevision !== dto.expectedRevision || current.updatedAt.toISOString() !== new Date(dto.expectedUpdatedAt).toISOString()) {
      throw new ConflictException('This employee changed while you were reviewing. Reload the status, then confirm again.');
    }
    if (current.employmentStatus === dto.status) throw new BadRequestException('The employee already has this status. No change was made.');
    const result = await tx.employee.updateMany({
      where: { id: employeeId, organizationId, employmentStatusRevision: dto.expectedRevision, updatedAt: current.updatedAt },
      data: { employmentStatus: dto.status, employmentStatusRevision: { increment: 1 } },
    });
    if (result.count !== 1) throw new ConflictException('This employee changed while you were reviewing. Reload the status, then confirm again.');
    const actor = await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } });
    return tx.emsEmploymentStatusChange.create({ data: {
      employeeId, subjectEmployeeId: employeeId, organizationId, requestId: dto.requestId, fromStatus: current.employmentStatus, toStatus: dto.status,
      reason, actorUserId, actorName: actor?.name ?? null, source: 'EMS_MANUAL', revision: dto.expectedRevision + 1,
      expectedUpdatedAt: current.updatedAt, previousDepartmentId: current.departmentId, previousJobTitle: current.jobTitle,
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }));
  await synchronize(prisma, dwms, organizationId, employeeId, change);
  return getEmploymentStatus(prisma, organizationId, employeeId);
}

export async function retryEmploymentActivitySync(prisma: PrismaService, dwms: DwmsService | undefined, organizationId: string, employeeId: string, changeId: string) {
  const change = await prisma.emsEmploymentStatusChange.findFirst({ where: { id: changeId, employeeId, organizationId } });
  if (!change) throw new NotFoundException('Status change not found');
  await synchronize(prisma, dwms, organizationId, employeeId, change);
  return getEmploymentStatus(prisma, organizationId, employeeId);
}
