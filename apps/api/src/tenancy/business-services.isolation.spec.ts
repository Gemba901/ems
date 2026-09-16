import 'reflect-metadata';
import { CalendarService } from '../calendar/calendar.service';
import { KaizenService } from '../kaizen/kaizen.service';
import { SimsService } from '../sims/sims.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketsController } from '../tickets/tickets.controller';
import { TicketsService } from '../tickets/tickets.service';
import { CompanyOrganizationController } from '../organizations/company-organization.controller';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enum/role.enum';
import { ModuleType, NotificationType } from 'db';
import { DwmsService } from '../dwms/dwms.service';

describe('Business service tenant references', () => {
  const employee = { id: 'employee-one', organizationId: 'org-one', departmentId: 'dept-one' };
  let db: any;
  let notifications: any;
  beforeEach(() => {
    db = {
      employee: { findFirst: jest.fn().mockResolvedValue(employee), count: jest.fn().mockResolvedValue(0) },
      department: { findFirst: jest.fn().mockResolvedValue(null) },
      taskInstance: { findFirst: jest.fn().mockResolvedValue(null) },
      alert: { create: jest.fn() },
      suggestion: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { create: jest.fn(), findMany: jest.fn() },
      eventInvitation: { findMany: jest.fn() },
      kaizen: { update: jest.fn() },
    };
    notifications = { create: jest.fn(), getNotificationsForEmployee: jest.fn() };
  });

  it('SIMS selects the current company employee for personal suggestions', async () => {
    const sims = new SimsService(db as PrismaService, notifications as NotificationsService, {} as KaizenService);
    await sims.getMySuggestions('shared-user', 'org-one');
    expect(db.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'shared-user', organizationId: 'org-one' } }));
    expect(db.suggestion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { employeeId: employee.id } }));
  });

  it('notifications select the employee in the current company', async () => {
    const controller = new NotificationsController(notifications, db);
    await controller.getMyNotifications({ userId: 'shared-user', organizationId: 'org-one' });
    expect(db.employee.findFirst).toHaveBeenCalledWith({ where: { userId: 'shared-user', organizationId: 'org-one' } });
    expect(notifications.getNotificationsForEmployee).toHaveBeenCalledWith(employee.id, 1, 20);
  });

  it('rejects sending a notification to another company employee', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    const controller = new NotificationsController(notifications, db);
    await expect(controller.send({ employeeId: 'foreign', type: NotificationType.INFO, module: 'EMS', title: 'Test', message: 'Test' }, { organizationId: 'org-one' })).rejects.toThrow();
    expect(db.employee.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org-one' }, select: { id: true } });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it.each(['availability', 'stats', 'invitations'])('rejects a foreign calendar employee in %s', async (kind) => {
    const service = new CalendarService(db, notifications);
    const pending = kind === 'availability' ? service.checkAvailability('foreign', '2026-09-15', '2026-09-16', 'org-one') :
      kind === 'stats' ? service.getEmployeeEventStats('foreign', 'org-one') : service.getEmployeeInvitationLog('foreign', 1, 20, 'org-one');
    await expect(pending).rejects.toThrow();
    expect(db.employee.count).toHaveBeenCalledWith({ where: { id: { in: ['foreign'] }, organizationId: 'org-one' } });
    expect(db.eventInvitation.findMany).not.toHaveBeenCalled();
  });

  it('rejects foreign calendar invitees before creating events or notifications', async () => {
    const service = new CalendarService(db, notifications);
    await expect(service.createEvent({ title: 'Test', startAt: '2026-09-15T10:00:00Z', endAt: '2026-09-15T11:00:00Z', inviteeIds: ['foreign'] } as any, 'shared-user', 'org-one', Role.ADMIN)).rejects.toThrow();
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('rejects foreign Kaizen owners and team members before writing', async () => {
    const service = new KaizenService(db, notifications);
    await expect(service.updateBasicInfo('kaizen-one', 'shared-user', { kaizenOwnerId: 'foreign', teamMemberIds: ['foreign-two'] } as any, 'org-one')).rejects.toThrow();
    expect(db.employee.count).toHaveBeenCalledWith({ where: { id: { in: ['foreign-two', 'foreign'] }, organizationId: 'org-one' } });
    expect(db.kaizen.update).not.toHaveBeenCalled();
  });

  it('normal ticket endpoints never enable cross-company support access', async () => {
    const service = { getById: jest.fn(), updateTicket: jest.fn() };
    const controller = new TicketsController(service as unknown as TicketsService);
    const user = { userId: 'shared-user', organizationId: 'org-one', isAdminOrg: true, roleLevel: Role.SUPER_ADMIN };
    await controller.getById('ticket-one', user);
    await controller.updateTicket('ticket-one', {}, user);
    expect(service.getById).toHaveBeenCalledWith('ticket-one', 'shared-user', 'org-one', false, Role.SUPER_ADMIN);
    expect(service.updateTicket).toHaveBeenCalledWith('ticket-one', {}, 'shared-user', 'org-one', false);
  });

  it('company profile updates cannot enable paid modules', () => {
    const service = { update: jest.fn() };
    const controller = new CompanyOrganizationController(service as unknown as OrganizationsService);
    expect(() => controller.update({ modules: [ModuleType.STEEL] }, { tenant: { organizationId: 'org-one' } } as any)).toThrow();
    expect(service.update).not.toHaveBeenCalled();
  });

  it.each(['department', 'task', 'person'])('rejects a foreign DWMS %s reference even on a general alert', async (kind) => {
    const service = new DwmsService(db, notifications);
    jest.spyOn(service, 'getEmployee').mockResolvedValue(employee as any);
    db.employee.findFirst.mockResolvedValue(null);
    const reference = kind === 'department' ? { departmentId: 'foreign' } : kind === 'task' ? { taskInstanceId: 'foreign' } : { againstUserId: 'foreign' };
    await expect(service.createAlert({ userId: 'user-one', organizationId: 'org-one', roleLevel: Role.ADMIN }, {
      targetType: 'GENERAL', title: 'Test', description: 'Test', severity: 'HIGH', ...reference,
    } as any)).rejects.toThrow();
    expect(db.alert.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
