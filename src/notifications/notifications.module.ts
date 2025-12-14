import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationOrchestrator } from './notification.orchestrator';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationService, NotificationOrchestrator],
  exports: [NotificationService, NotificationOrchestrator]
})
export class NotificationsModule {}
