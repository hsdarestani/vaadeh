import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

type Bucket = { remaining: number; resetAt: number };

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  assertWithinLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { remaining: limit - 1, resetAt: now + windowMs });
      return;
    }

    if (current.remaining <= 0) {
      throw new ThrottlerException('Rate limit exceeded');
    }

    this.buckets.set(key, { ...current, remaining: current.remaining - 1 });
  }
}
