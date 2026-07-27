import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketType, TicketStatus, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';


interface CreateTicketInput {
    type: TicketType;
    module: string;
    subject: string;
    message: string;
    department: string;
}
interface UpdateTicketInput {
    typeChanged?: TicketType;
    statusChanged?: TicketStatus;
    note?: string;
}


@Injectable()
export class TicketsService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
    ) { }

    private async resolveEmployee(userId: string, organizationId?: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, ...(organizationId && { organizationId }) },
            select: { id: true, organizationId: true },
        });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');
        return employee;
    }

    // create a ticket
    async create(input: CreateTicketInput, userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);

        const ticket = await this.prisma.tickets.create({
            data: {
                raisedById: employee.id,
                organizationId,
                type: input.type,
                module: input.module,
                subject: input.subject,
                message: input.message,
                department: input.department
            }
        });

        const recipients = input.type === TicketType.SYSTEM_TICKET
            ? await this.getSystemTicketRecipients()
            : await this.getCompanyTicketRecipients(organizationId);

        await this.notifications.createMany(
            recipients.map((r) => ({
                employeeId: r.id,
                type: 'ACTION_REQUIRED' as const,
                module: 'TICKETS',
                title: 'New ticket raised',
                message: `A new ${input.type === 'SYSTEM_TICKET' ? 'system' : 'company'} ticket "${ticket.subject}" was raised.`,
                actionUrl: `/tickets/${ticket.id}`,
                metadata: { ticketId: ticket.id },
            }))
        )

        return ticket;
    }

    private async getCompanyTicketRecipients(organizationId: string) {
        return this.prisma.employee.findMany({
            where: {
                organizationId,
                user: { organizations: { some: { organizationId, role: { name: 'ADMIN' } } } }
            },
            select: { id: true },
        })
    }

    private async getSystemTicketRecipients() {
        const adminOrg = await this.prisma.organization.findFirst({
            where: {
                isAdminOrg: true
            }
        })
        if (!adminOrg) return [];
        return this.prisma.employee.findMany({
            where: {
                organizationId: adminOrg.id,
                user: { organizations: { some: { organizationId: adminOrg.id, role: { name: 'SUPER_ADMIN' } } } },
            },
            select: { id: true },
        });
    }


    private readonly raisedByInclude = {
        raisedBy: {
            select: {
                id: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
            },
        },
    } as const;

    private readonly detailInclude = {
        ...this.raisedByInclude,
        updates: {
            orderBy: { createdAt: 'asc' as const },
            include: {
                updatedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        },
    } as const;

    // get company ticket for company admin
    async getCompanyTickets(organizationId: string) {
        return this.prisma.tickets.findMany({
            where: {
                organizationId,
                type: TicketType.COMPANY_TICKET
            },
            include: this.raisedByInclude,
            orderBy: { createdAt: 'desc' }
        });
    }

    // get system ticket for super admin
    async getSystemTicket() {
        return this.prisma.tickets.findMany({
            where: {
                type: TicketType.SYSTEM_TICKET
            },
            include: this.raisedByInclude,
            orderBy: { createdAt: 'desc'}
        })
    }

    // get the current employee's own raised tickets
    async getMine(userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        return this.prisma.tickets.findMany({
            where: { raisedById: employee.id },
            include: this.raisedByInclude,
            orderBy: { createdAt: 'desc' },
        });
    }

    // get a single ticket with its update history
    async getById(id: string, userId: string, organizationId: string, isAdminOrg: boolean, roleLevel: string) {
        const ticket = await this.prisma.tickets.findFirst({
            where: { id },
            include: this.detailInclude,
        });
        if (!ticket) throw new NotFoundException('Ticket not found');

        const employee = await this.resolveEmployee(userId, organizationId);
        const isOwner = ticket.raisedById === employee.id;
        const isOrgAdmin = ticket.organizationId === organizationId && (roleLevel === 'ADMIN' || roleLevel === 'SUPER_ADMIN');

        if (!isOwner && !isOrgAdmin && !isAdminOrg) {
            throw new ForbiddenException('Cannot view this ticket');
        }

        return ticket;
    }

    // update ticket status (should also show who fixed, and if there was any feedback to the one who raised the ticket)
    async updateTicket(id: string, input: UpdateTicketInput, userId: string, organizationId: string, isAdminOrg: boolean) {
        const ticket = await this.prisma.tickets.findFirst({ where: { id } });
        if (!ticket) throw new NotFoundException('Ticket not found');

        if (!isAdminOrg && ticket.organizationId !== organizationId) {
            throw new ForbiddenException('Cannot update a ticket outside your organization');
        }

        const updater = await this.resolveEmployee(userId, isAdminOrg ? undefined : organizationId);
        const updatedById = updater.id;

        const statusChanged = Boolean(input.statusChanged && input.statusChanged !== ticket.status);
        const typeChanged = Boolean(input.typeChanged && input.typeChanged !== ticket.type);

        const [updated] = await this.prisma.$transaction([
            this.prisma.tickets.update({
                where: { id },
                data: {
                    ...(input.statusChanged && { status: input.statusChanged }),
                    ...(input.typeChanged && { type: input.typeChanged }),
                },
            }),

            this.prisma.ticketUpdate.create({
                data: {
                    ticketId: id,
                    updatedById,
                    ...(statusChanged && { statusChanged: input.statusChanged }),
                    ...(typeChanged && { typeChanged: input.typeChanged }),
                    note: input.note,
                },
            }),
        ]);

        if (ticket.raisedById !== updatedById && (statusChanged || input.note)) {
            await this.notifications.create({
                employeeId: ticket.raisedById,
                type: 'INFO',
                module: 'TICKETS',
                title: statusChanged ? `Ticket status changed to ${input.statusChanged}` : 'Update on your ticket',
                message: input.note ?? `Your ticket "${ticket.subject}" was updated.`,
                actionUrl: `/tickets/${id}`,
                metadata: { ticketId: id },
            });
        }

        if (typeChanged && input.typeChanged === TicketType.SYSTEM_TICKET) {
            const recipients = await this.getSystemTicketRecipients();
            await this.notifications.createMany(
                recipients.map((r) => ({
                    employeeId: r.id,
                    type: 'ACTION_REQUIRED' as const,
                    module: 'TICKETS',
                    title: 'Ticket escalated to system ticket',
                    message: `Ticket "${ticket.subject}" was escalated and needs attention.`,
                    actionUrl: `/tickets/${id}`,
                    metadata: { ticketId: id },
                })),
            );
        }

        return updated;
    }



}
