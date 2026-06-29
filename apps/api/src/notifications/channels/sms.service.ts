import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    // Stub — wire up Africa's Talking or Twilio when the API key is available
    async send(phone: string, message: string): Promise<void> {
        this.logger.log(`[SMS stub] To: ${phone} | Message: ${message}`);
    }
}
