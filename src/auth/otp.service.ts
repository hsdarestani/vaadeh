import { Injectable, TooManyRequestsException } from '@nestjs/common';
import { randomInt } from 'crypto';

interface OtpEntry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly codes = new Map<string, OtpEntry>();
  private readonly attempts = new Map<string, number[]>();
  private ttlMs = 5 * 60 * 1000;
  private windowMs = 10 * 60 * 1000;
  private maxAttempts = Number(process.env.OTP_RATE_LIMIT_PER_WINDOW ?? 5);

  generateCode(mobile: string): string {
    this.enforceRateLimit(mobile);
    const code = randomInt(1000, 9999).toString();
    this.codes.set(mobile, { code, expiresAt: Date.now() + this.ttlMs });
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
    const valid = entry.code === code && Date.now() < entry.expiresAt;
    if (valid) {
      this.codes.delete(mobile);
    }
    return valid;
  }
}
