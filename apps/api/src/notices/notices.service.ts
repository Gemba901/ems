import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateNoticeDto, UpdateNoticeDto } from './dto/notice.dto';

@Injectable()
export class NoticesService {
    constructor(private prisma: PrismaService) {}

    async getNotices(organizationId: string) {
        const now = new Date();
        return (this.prisma as any).notice.findMany({
            where: {
                organizationId,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: now } },
                ],
            },
            orderBy: [
                { pinned: 'desc' },
                { createdAt: 'desc' },
            ],
        });
    }

    async createNotice(organizationId: string, dto: CreateNoticeDto) {
        return (this.prisma as any).notice.create({
            data: {
                organizationId,
                type:      dto.type,
                title:     dto.title,
                body:      dto.body,
                pinned:    dto.pinned    ?? false,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            },
        });
    }

    async updateNotice(id: string, organizationId: string, dto: UpdateNoticeDto) {
        const notice = await (this.prisma as any).notice.findUnique({ where: { id } });
        if (!notice)                                throw new NotFoundException('Notice not found');
        if (notice.organizationId !== organizationId) throw new ForbiddenException();

        return (this.prisma as any).notice.update({
            where: { id },
            data: {
                ...(dto.type      !== undefined ? { type:      dto.type }      : {}),
                ...(dto.title     !== undefined ? { title:     dto.title }     : {}),
                ...(dto.body      !== undefined ? { body:      dto.body }      : {}),
                ...(dto.pinned    !== undefined ? { pinned:    dto.pinned }    : {}),
                ...(dto.expiresAt !== undefined
                    ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
                    : {}),
            },
        });
    }

    async deleteNotice(id: string, organizationId: string) {
        const notice = await (this.prisma as any).notice.findUnique({ where: { id } });
        if (!notice)                                throw new NotFoundException('Notice not found');
        if (notice.organizationId !== organizationId) throw new ForbiddenException();
        return (this.prisma as any).notice.delete({ where: { id } });
    }
}
