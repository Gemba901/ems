import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChannelDispatcherService } from './channels/channel-dispatcher.service';

interface CreateNotificationInput {
    employeeId: string;
    type: NotificationType;
    module: string;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Prisma.InputJsonValue;
}

export interface NotificationPreferences {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
}

@Injectable()
export class NotificationsService {
    constructor(
        private prisma: PrismaService,
        private dispatcher: ChannelDispatcherService,
    ) {}

    async create(input: CreateNotificationInput) {
        const [notification, employee] = await Promise.all([
            this.prisma.notification.create({ data: input }),
            this.prisma.employee.findUnique({
                where: { id: input.employeeId },
                select: { email: true, phone: true, whatsappNumber: true, notificationPreferences: true },
            }),
        ]);

        if (employee) {
            // fire-and-forget — channel failures must not break the main flow
            void this.dispatcher.dispatch(employee, {
                title: input.title,
                message: input.message,
                actionUrl: input.actionUrl,
            });
        }

        return notification;
    }

    async createMany(inputs: CreateNotificationInput[]) {
        return this.prisma.notification.createMany({ data: inputs });
    }

    async getNotificationsForEmployee(employeeId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [notifications, total, unreadCount] = await Promise.all([
            this.prisma.notification.findMany({
                where: { employeeId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.notification.count({ where: { employeeId } }),
            this.prisma.notification.count({ where: { employeeId, isRead: false } }),
        ]);
        return { notifications, total, unreadCount, page, limit };
    }

    async markRead(id: string, employeeId: string) {
        return this.prisma.notification.updateMany({
            where: { id, employeeId },
            data: { isRead: true },
        });
    }

    async markAllRead(employeeId: string) {
        return this.prisma.notification.updateMany({
            where: { employeeId, isRead: false },
            data: { isRead: true },
        });
    }

    async getUnreadCount(employeeId: string) {
        return this.prisma.notification.count({ where: { employeeId, isRead: false } });
    }

    async broadcast(organizationId: string, input: Omit<CreateNotificationInput, 'employeeId'>) {
        const employees = await this.prisma.employee.findMany({
            where: { organizationId },
            select: { id: true, email: true, phone: true, whatsappNumber: true, notificationPreferences: true },
        });

        await this.prisma.notification.createMany({
            data: employees.map((e) => ({ ...input, employeeId: e.id })),
        });

        void this.dispatcher.dispatchBulk(employees, {
            title: input.title,
            message: input.message,
            actionUrl: input.actionUrl,
        });
    }

    async getPreferences(employeeId: string): Promise<NotificationPreferences> {
        const employee = await this.prisma.employee.findUnique({
            where: { id: employeeId },
            select: { notificationPreferences: true },
        });
        const raw = employee?.notificationPreferences;
        if (!raw || typeof raw !== 'object') {
            return { email: true, sms: false, whatsapp: false };
        }
        const p = raw as Record<string, unknown>;
        return {
            email: p['email'] !== false,
            sms: p['sms'] === true,
            whatsapp: p['whatsapp'] === true,
        };
    }

    async updatePreferences(employeeId: string, prefs: Partial<NotificationPreferences>) {
        const current = await this.getPreferences(employeeId);
        const updated = { ...current, ...prefs };
        await this.prisma.employee.update({
            where: { id: employeeId },
            data: { notificationPreferences: updated },
        });
        return updated;
    }
}
