import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';

interface NotificationPayload {
    title: string;
    message: string;
    actionUrl?: string | null;
}

interface EmployeeContact {
    email: string;
    phone?: string | null;
    whatsappNumber?: string | null;
    notificationPreferences?: unknown;
}

interface Prefs {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
}

const DEFAULT_PREFS: Prefs = { email: true, sms: false, whatsapp: false };

function parsePrefs(raw: unknown): Prefs {
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    const p = raw as Record<string, unknown>;
    return {
        email: p['email'] !== false,
        sms: p['sms'] === true,
        whatsapp: p['whatsapp'] === true,
    };
}

@Injectable()
export class ChannelDispatcherService {
    constructor(
        private email: EmailService,
        private sms: SmsService,
        private whatsapp: WhatsappService,
    ) {}

    async dispatch(employee: EmployeeContact, payload: NotificationPayload): Promise<void> {
        const prefs = parsePrefs(employee.notificationPreferences);
        const dispatches: Promise<void>[] = [];

        if (prefs.email) {
            dispatches.push(
                this.email.send({
                    to: employee.email,
                    subject: payload.title,
                    title: payload.title,
                    message: payload.message,
                    actionUrl: payload.actionUrl ?? undefined,
                }),
            );
        }

        if (prefs.sms && employee.phone) {
            dispatches.push(this.sms.send(employee.phone, `${payload.title}: ${payload.message}`));
        }

        if (prefs.whatsapp && employee.whatsappNumber) {
            dispatches.push(this.whatsapp.send(employee.whatsappNumber, `${payload.title}: ${payload.message}`));
        }

        await Promise.allSettled(dispatches);
    }

    async dispatchBulk(employees: EmployeeContact[], payload: NotificationPayload): Promise<void> {
        await Promise.allSettled(employees.map((emp) => this.dispatch(emp, payload)));
    }
}
