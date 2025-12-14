import { SetMetadata } from '@nestjs/common';

export const EVENT_LOG_METADATA = 'event_log';

export interface EventLogMetadata {
  eventName: string;
}

export const LogEvent = (eventName: string) => SetMetadata(EVENT_LOG_METADATA, { eventName });
