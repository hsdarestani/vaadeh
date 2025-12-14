import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { NotificationService } from '../notifications/notification.service';

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
    private readonly notifications: NotificationService
  ) {}

  async requestOtp(mobile: string) {
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    const code = this.otp.generateCode(mobile);
    await this.notifications.sendSms(mobile, `کد ورود شما: ${code}`);
    return { mobile, codeSent: true, code }; // expose for MVP/testing
  }

  private signTokens(userId: string, mobile: string, role: UserRole): TokenBundle {
    const payload = { sub: userId, mobile, role };
    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  async verifyOtp(mobile: string, code: string) {
    const isValid = this.otp.verifyCode(mobile, code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user || user.isBlocked || !user.isActive) {
      throw new UnauthorizedException('اکانت شما فعال نیست');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = this.signTokens(user.id, user.mobile, user.role ?? UserRole.CUSTOMER);
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
}
