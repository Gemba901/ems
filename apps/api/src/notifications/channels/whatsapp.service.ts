import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    // Stub — wire up Africa's Talking or Twilio when the API key is available
    async send(whatsappNumber: string, message: string): Promise<void> {
        this.logger.log(`[WhatsApp stub] To: ${whatsappNumber} | Message: ${message}`);
    }
}
