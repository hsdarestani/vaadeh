import { Injectable, TooManyRequestsException } from '@nestjs/common';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';

interface OtpEntry {
  hash: Buffer;
  salt: Buffer;
  expiresAt: number;
  attempts: number;
  lockedUntil?: number;
}

@Injectable()
export class OtpService {
  private readonly codes = new Map<string, OtpEntry>();
  private readonly attempts = new Map<string, number[]>();
  private ttlMs = 5 * 60 * 1000;
  private windowMs = 10 * 60 * 1000;
  private maxAttempts = Number(process.env.OTP_RATE_LIMIT_PER_WINDOW ?? 5);
  private maxVerifyAttempts = 5;
  private lockoutMs = 10 * 60 * 1000;

  generateCode(mobile: string): string {
    this.enforceRateLimit(mobile);
    const code = randomInt(1000, 9999).toString();
    const salt = randomBytes(16);
    const hash = scryptSync(code, salt, 32);
    this.codes.set(mobile, { hash, salt, expiresAt: Date.now() + this.ttlMs, attempts: 0 });
    const now = Date.now();
    const attempts = this.attempts.get(mobile) ?? [];
    attempts.push(now);
    this.attempts.set(mobile, attempts);
    return code;
  }

  private enforceRateLimit(mobile: string) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const attempts = (this.attempts.get(mobile) ?? []).filter((ts) => ts >= windowStart);

    if (attempts.length >= this.maxAttempts) {
      throw new TooManyRequestsException('OTP requests are temporarily limited. Please wait a bit.');
    }

    this.attempts.set(mobile, attempts);
  }

  verifyCode(mobile: string, code: string): boolean {
    const entry = this.codes.get(mobile);
    if (!entry) return false;
    if (entry.lockedUntil && entry.lockedUntil > Date.now()) return false;
    if (Date.now() > entry.expiresAt) {
      this.codes.delete(mobile);
      return false;
    }

    const computed = scryptSync(code, entry.salt, entry.hash.length);
    const valid = timingSafeEqual(computed, entry.hash);
    if (valid) {
      this.codes.delete(mobile);
      return true;
    }

    entry.attempts += 1;
    if (entry.attempts >= this.maxVerifyAttempts) {
      entry.lockedUntil = Date.now() + this.lockoutMs;
    }
    this.codes.set(mobile, entry);
    return false;
  }
}
