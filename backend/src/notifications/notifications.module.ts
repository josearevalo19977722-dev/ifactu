import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Global()
@Module({
  controllers: [WhatsappController],
  providers:   [EmailService, WhatsappService],
  exports:     [EmailService, WhatsappService],
})
export class NotificationsModule {}
