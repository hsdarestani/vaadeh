import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';

interface OtpEntry {
  hash: string;
  salt: string;
  attempts: number;
  lockedUntil?: number;
}

@Injectable()
export class OtpService {
  private ttlMs = 5 * 60 * 1000;
  private windowMs = 10 * 60 * 1000;
  private maxAttempts = Number(process.env.OTP_RATE_LIMIT_PER_WINDOW ?? 5);
  private maxVerifyAttempts = 5;
  private lockoutMs = 10 * 60 * 1000;

  constructor(private readonly redis: RedisService) {}

  private codeKey(mobile: string) {
    return `otp:code:${mobile}`;
  }

  private requestKey(mobile: string) {
    return `otp:req:${mobile}`;
  }

  async generateCode(mobile: string): Promise<string> {
    await this.enforceRateLimit(mobile);
    const code = randomInt(1000, 9999).toString();
    const salt = randomBytes(16);
    const hash = scryptSync(code, salt, 32);
    const entry: OtpEntry = { hash: hash.toString('hex'), salt: salt.toString('hex'), attempts: 0 };

    await this.redis.getClient().set(this.codeKey(mobile), JSON.stringify(entry), 'PX', this.ttlMs);
    return code;
  }

  private async enforceRateLimit(mobile: string) {
    const key = this.requestKey(mobile);
    const count = await this.redis.getClient().incr(key);
    if (count === 1) {
      await this.redis.getClient().pexpire(key, this.windowMs);
    }

    if (count > this.maxAttempts) {
      throw new ThrottlerException('OTP requests are temporarily limited. Please wait a bit.');
    }
  }

  async verifyCode(mobile: string, code: string): Promise<boolean> {
    const raw = await this.redis.getClient().get(this.codeKey(mobile));
    if (!raw) return false;

    const entry = JSON.parse(raw) as OtpEntry;
    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
      return false;
    }

    const computed = scryptSync(code, Buffer.from(entry.salt, 'hex'), Buffer.from(entry.hash, 'hex').length);
    const valid = timingSafeEqual(computed, Buffer.from(entry.hash, 'hex'));

    if (valid) {
      await this.redis.getClient().del(this.codeKey(mobile));
      return true;
    }

    entry.attempts += 1;
    if (entry.attempts >= this.maxVerifyAttempts) {
      entry.lockedUntil = Date.now() + this.lockoutMs;
    }

    await this.redis
      .getClient()
      .set(this.codeKey(mobile), JSON.stringify(entry), 'PX', Math.max(this.lockoutMs, this.ttlMs));

    return false;
  }
}
