import { ConflictException, Injectable } from '@nestjs/common';
import { KaizenTrigger, NotificationType, SgaStartingReason } from 'db';
import { DwmsService, UserPayload } from 'src/dwms/dwms.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SgaService } from 'src/sga/sga.service';
import { isUniqueViolation } from 'src/work/work-errors';
import { RaiseFromAlertDto } from './dto/kaizen.dto';
import { KaizenService } from './kaizen.service';

type VisibleAlert = Awaited<ReturnType<DwmsService['findVisibleAlert']>>;

// Join 10: a DWMS alert or abnormality that needs a real fix becomes a Kaizen (one owner) or an SGA
// (a team project). Anyone who can see the alert can raise it; the new draft is prefilled from the
// alert and keeps a typed link back to it. One improvement per alert. The alert itself carries on
// as before (acknowledgements, raise again).
@Injectable()
export class AlertImprovementsService {
    constructor(
        private prisma: PrismaService,
        private dwms: DwmsService,
        private kaizens: KaizenService,
        private sgas: SgaService,
        private notifications: NotificationsService,
    ) {}

    async raiseKaizen(user: UserPayload, alertId: string, dto: RaiseFromAlertDto) {
        const { actorId, alert, ownerId } = await this.prepare(user, alertId, dto);
        let kaizen: Awaited<ReturnType<KaizenService['createKaizenForEmployee']>>;
        try {
            kaizen = await this.kaizens.createKaizenForEmployee(
                ownerId,
                {
                    trigger: alert.isAbnormality ? KaizenTrigger.ABNORMALITY_ACTION_REQUIRED : KaizenTrigger.ALERT_ACTION_REQUIRED,
                    title: alert.title,
                    conditionDescription: problemText(alert),
                    sourceAlertId: alert.id,
                },
                user.organizationId,
            );
        } catch (error) {
            if (isUniqueViolation(error)) throw alreadyRaised();
            throw error;
        }

        await this.afterRaise(actorId, alert, ownerId, {
            comment: `Raised a Kaizen to fix this ${kind(alert)}.`,
            module: 'KAIZEN',
            title: `Kaizen raised from ${article(alert)} — complete the draft`,
            message: `A Daily Gemba Kaizen was raised for you from the ${kind(alert)} "${alert.title}".`,
            actionUrl: `/kaizen/${kaizen.id}`,
            metadata: { kaizenId: kaizen.id, alertId: alert.id },
        });
        return { kaizen: { id: kaizen.id, title: kaizen.title, status: kaizen.status } };
    }

    async raiseSga(user: UserPayload, alertId: string, dto: RaiseFromAlertDto) {
        const { actorId, alert, ownerId } = await this.prepare(user, alertId, dto);
        let sga: Awaited<ReturnType<SgaService['createSgaForEmployee']>>;
        try {
            sga = await this.sgas.createSgaForEmployee(
                ownerId,
                {
                    startingReason: SgaStartingReason.ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT,
                    title: alert.title,
                    problemDescription: problemText(alert),
                    mainDepartmentId: alert.departmentId ?? undefined,
                    sourceAlertId: alert.id,
                },
                user.organizationId,
            );
        } catch (error) {
            if (isUniqueViolation(error)) throw alreadyRaised();
            throw error;
        }

        await this.afterRaise(actorId, alert, ownerId, {
            comment: `Raised an SGA to fix this ${kind(alert)}.`,
            module: 'SGA',
            title: `SGA raised from ${article(alert)} — complete the draft`,
            message: `A Small Group Activity was raised for you from the ${kind(alert)} "${alert.title}".`,
            actionUrl: `/sga/${sga.id}`,
            metadata: { sgaId: sga.id, alertId: alert.id },
        });
        return { sga: { id: sga.id, title: sga.title, status: sga.status } };
    }

    // The owner defaults to the person the alert is against, else whoever raises it.
    private async prepare(user: UserPayload, alertId: string, dto: RaiseFromAlertDto) {
        const actor = await this.dwms.getEmployee(user.userId, user.organizationId);
        const alert = await this.dwms.findVisibleAlert(user, alertId);
        if (alert.raisedKaizen || alert.raisedSga) throw alreadyRaised();
        return { actorId: actor.id, alert, ownerId: dto.ownerId ?? alert.againstUserId ?? actor.id };
    }

    private async afterRaise(
        actorId: string,
        alert: VisibleAlert,
        ownerId: string,
        note: { comment: string; module: string; title: string; message: string; actionUrl: string; metadata: Record<string, string> },
    ) {
        // Shows on the alert's discussion, so whoever follows it sees the fix is under way.
        await this.prisma.alertComment.create({ data: { alertId: alert.id, authorId: actorId, comment: note.comment } });
        if (ownerId === actorId) return;
        await this.notifications.create({
            employeeId: ownerId,
            type: NotificationType.ACTION_REQUIRED,
            module: note.module,
            title: note.title,
            message: note.message,
            actionUrl: note.actionUrl,
            metadata: note.metadata,
        });
    }
}

function kind(alert: { isAbnormality: boolean }) {
    return alert.isAbnormality ? 'abnormality' : 'alert';
}

function article(alert: { isAbnormality: boolean }) {
    return alert.isAbnormality ? 'an abnormality' : 'an alert';
}

function problemText(alert: { title: string; description: string; raiseCount: number; isAbnormality: boolean }) {
    const lines = [alert.title, alert.description];
    if (alert.raiseCount > 1) lines.push(`Raised ${alert.raiseCount} times in DWMS.`);
    return lines.join('\n');
}

function alreadyRaised() {
    return new ConflictException('A Kaizen or SGA has already been raised from this alert');
}
