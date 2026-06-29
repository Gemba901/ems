import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface EmailPayload {
    to: string;
    subject: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private readonly ses: SESClient;
    private readonly from: string;

    constructor(private config: ConfigService) {
        this.ses = new SESClient({
            region: this.config.get<string>('AWS_REGION', 'eu-north-1'),
            credentials: {
                accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID')!,
                secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY')!,
            },
        });
        this.from = this.config.get<string>('SES_FROM_EMAIL', 'info@gembapms.com');
    }

    async send(payload: EmailPayload): Promise<void> {
        const { to, subject, title, message, actionUrl, actionLabel } = payload;

        const ctaBlock = actionUrl
            ? `<div style="margin:32px 0;text-align:center;">
                 <a href="${actionUrl}"
                    style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
                           padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
                   ${actionLabel ?? 'View Details'}
                 </a>
               </div>`
            : '';

        const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1e40af;padding:24px 32px;border-radius:8px 8px 0 0;">
            <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
              Gemba PMS
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${title}</h2>
            <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">${message}</p>
            ${ctaBlock}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              This is an automated notification from Gemba PMS. Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

        const text = `${title}\n\n${message}${actionUrl ? `\n\n${actionLabel ?? 'View Details'}: ${actionUrl}` : ''}`;

        try {
            await this.ses.send(new SendEmailCommand({
                Source: `Gemba PMS <${this.from}>`,
                Destination: { ToAddresses: [to] },
                Message: {
                    Subject: { Data: subject, Charset: 'UTF-8' },
                    Body: {
                        Html: { Data: html, Charset: 'UTF-8' },
                        Text: { Data: text, Charset: 'UTF-8' },
                    },
                },
            }));
            this.logger.log(`Email sent to ${to}: "${subject}"`);
        } catch (err) {
            this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
        }
    }
}
