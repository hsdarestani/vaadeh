import { Injectable, UnauthorizedException } from '@nestjs/common';
import { EventActorType, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { NotificationService } from '../notifications/notification.service';
import { EventLogService } from '../event-log/event-log.service';
import { RateLimitService } from '../middleware/rate-limit.service';
import { ProductEventService } from '../event-log/product-event.service';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
    private readonly notifications: NotificationService,
    private readonly events: EventLogService,
    private readonly rateLimit: RateLimitService,
    private readonly productEvents: ProductEventService
  ) {}

  private assertAdminRole(role: UserRole | null): void {
    if (role !== UserRole.ADMIN && role !== UserRole.OPERATOR) {
      throw new UnauthorizedException('دسترسی ادمین ندارید');
    }
  }

  async requestOtp(mobile: string) {
    this.rateLimit.assertWithinLimit(`otp:${mobile}`, 5, 10 * 60 * 1000);
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    const code = await this.otp.generateCode(mobile);
    await this.notifications.sendSms(mobile, `کد ورود شما: ${code}`, {
      eventName: 'login_otp',
      userId: user.id
    });
    await this.events.logEvent('LOGIN_OTP_SENT', {
      userId: user.id,
      actorType: EventActorType.USER,
      metadata: { mobile }
    });
    await this.productEvents.track('login_otp_requested', {
      actorType: EventActorType.USER,
      actorId: user.id,
      metadata: { mobile }
    });
    return { mobile, codeSent: true };
  }

  async requestAdminOtp(mobile: string) {
    this.rateLimit.assertWithinLimit(`otp:${mobile}`, 5, 10 * 60 * 1000);
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    this.assertAdminRole(user.role);

    const code = await this.otp.generateCode(mobile);
    await this.notifications.sendSms(mobile, `کد ورود ادمین: ${code}`, {
      eventName: 'login_otp_admin',
      userId: user.id
    });
    await this.events.logEvent('LOGIN_ADMIN_OTP_SENT', {
      userId: user.id,
      actorType: EventActorType.USER,
      metadata: { mobile }
    });
    await this.productEvents.track('login_otp_requested', {
      actorType: EventActorType.USER,
      actorId: user.id,
      metadata: { mobile, role: 'admin' }
    });
    return { mobile, codeSent: true };
  }

  private signTokens(userId: string, mobile: string, role: UserRole): TokenBundle {
    const payload = { sub: userId, mobile, role };
    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  async verifyOtp(mobile: string, code: string) {
    const isValid = await this.otp.verifyCode(mobile, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.events.logEvent('LOGIN_OTP_VERIFIED', {
      userId: user.id,
      actorType: EventActorType.USER,
      metadata: { mobile }
    });
    await this.productEvents.track('login_otp_verified', {
      actorType: EventActorType.USER,
      actorId: user.id,
      metadata: { mobile }
    });

    const tokens = this.signTokens(user.id, user.mobile, user.role ?? UserRole.CUSTOMER);
    return { user: { ...user, lastLoginAt: new Date() }, ...tokens };
  }

  async verifyAdminOtp(mobile: string, code: string) {
    const isValid = await this.otp.verifyCode(mobile, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    this.assertAdminRole(user.role);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    await this.events.logEvent('LOGIN_ADMIN_OTP_VERIFIED', {
      userId: user.id,
      actorType: EventActorType.USER,
      metadata: { mobile }
    });
    await this.productEvents.track('login_otp_verified', {
      actorType: EventActorType.USER,
      actorId: user.id,
      metadata: { mobile, role: 'admin' }
    });

    const tokens = this.signTokens(user.id, user.mobile, user.role ?? UserRole.ADMIN);
    return { user: { ...user, lastLoginAt: new Date() }, ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_SECRET ?? 'dev-secret'
      }) as { sub: string; mobile: string; role: UserRole };
      return this.signTokens(payload.sub, payload.mobile, payload.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { addresses: true }
    });

    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    return user;
  }
}
