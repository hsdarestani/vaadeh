import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventLogModule } from '../event-log/event-log.module';

@Module({
  imports: [PrismaModule, EventLogModule],
  controllers: [MenuController],
  providers: [MenuService]
})
export class MenuModule {}
