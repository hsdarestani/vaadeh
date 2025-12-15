import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationOrchestrator } from './notification.orchestrator';
import { PrismaModule } from '../prisma/prisma.module';
import { EventLogModule } from '../event-log/event-log.module';

@Module({
  imports: [PrismaModule, EventLogModule],
  providers: [NotificationService, NotificationOrchestrator],
  exports: [NotificationService, NotificationOrchestrator]
})
export class NotificationsModule {}
