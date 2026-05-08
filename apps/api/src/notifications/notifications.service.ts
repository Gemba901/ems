import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from 'db';;
import { PrismaService } from 'src/prisma/prisma.service';

interface CreateNotificationInput {
    employeeId: string;
    type: NotificationType;
    module: string;
    title: string;
    message: string;
    actionUrl?: string;
    metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
    constructor(private prisma: PrismaService) {}

    async create(input: CreateNotificationInput) {
        return this.prisma.notification.create({
            data: input
        })
    }

    async createMany(inputs: CreateNotificationInput[]) {
        return this.prisma.notification.createMany({
            data: inputs
        })
    }

    async getNotificationsForEmployee(employeeId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [notifications, total, unreadCount] = await Promise.all([
            this.prisma.notification.findMany({
                where: { employeeId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            this.prisma.notification.count({
                where: { employeeId }
            }),
            this.prisma.notification.count({
                where: { employeeId, isRead: false }
            })
        ])
        return { notifications, total, unreadCount, page, limit };
    }

    async markRead(id: string, employeeId: string){
        return this.prisma.notification.updateMany({
            where: { id, employeeId },
            data: { isRead: true }
        })
    }

    async markAllRead(employeeId: string){
        return this.prisma.notification.updateMany({
            where: { employeeId, isRead: false },
            data: { isRead: true }
        })
    }

    async getUnreadCount(employeeId: string) {
        return this.prisma.notification.count({
            where: { employeeId, isRead: false }
        })
    }

    async broadcast(organizationId: string, input: Omit<CreateNotificationInput, 'employeeId'>) {
  const employees = await this.prisma.employee.findMany({
    where: { organizationId },
    select: { id: true },
  });
  return this.prisma.notification.createMany({
    data: employees.map((e) => ({ ...input, employeeId: e.id })),
  });
}
}
