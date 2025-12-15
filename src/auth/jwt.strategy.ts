import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UserRole } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const adminCookieExtractor = (req: Request) => req?.cookies?.admin_token ?? null;
    const accessCookieExtractor = (req: Request) => req?.cookies?.access_token ?? null;
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        adminCookieExtractor,
        accessCookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken()
      ]),
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret'
    });
  }

  async validate(payload: { sub: string; mobile: string; role: UserRole }) {
    return { userId: payload.sub, mobile: payload.mobile, role: payload.role };
  }
}
