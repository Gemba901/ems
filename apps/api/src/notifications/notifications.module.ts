import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EmailService } from './channels/email.service';
import { SmsService } from './channels/sms.service';
import { WhatsappService } from './channels/whatsapp.service';
import { ChannelDispatcherService } from './channels/channel-dispatcher.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    SmsService,
    WhatsappService,
    ChannelDispatcherService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
