import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ApprovedStrategicDirection, StrategicDirectionProvider, StrategicDirectionSummary } from '../common/contracts';

// the content stored in each approved version's snapshot column. 

type DirectionContent = Omit<ApprovedStrategicDirection, 'version' | 'approvedAt' | 'approvedById'>;

@Injectable()
export class StrategicDirectionService implements StrategicDirectionProvider{
    constructor(private readonly prisma: PrismaService) {}
    
    async getApproved(organizationId: string): Promise<ApprovedStrategicDirection | null> {
        const direction = await this.prisma.lexStrategicDirection.findUnique({
            where: { organizationId },
            select: { id: true, currentVersion: true}
        })

        if(!direction?.currentVersion) return null;

        const row = await this.prisma.lexStrategicDirectionVersion.findUnique({
            where : { directionId_version: {directionId: direction.id, version: direction.currentVersion}} ,  
        });
        if (!row) return null;

        return {
            ...(row.snapshot as unknown as DirectionContent),
            version: row.version,
            approvedAt: row.approvedAt,
            approvedById: row.approvedById,
        };
    }


    async getSummary(organizationId: string): Promise<StrategicDirectionSummary> {
        const approved = await this.getApproved(organizationId)
        if(approved) return { company: approved.company, approved: true, version: approved.version };

        const draft = await this.prisma.lexStrategicDirection.findUnique({
            where: { organizationId },
            select: { company: true },

        })

        return { company: draft?.company ?? '', approved: false, version: null };

    }
}