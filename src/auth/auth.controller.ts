import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCustomerCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    res.cookie('access_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/'
    });
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });
  }

  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.mobile);
  }

  @Post('admin/request-otp')
  requestAdminOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestAdminOtp(dto.mobile);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.mobile, dto.code);
  }

  @Post('web/verify-otp')
  async verifyOtpForWeb(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.verifyOtp(dto.mobile, dto.code);
    this.setCustomerCookies(res, tokens);
    return tokens;
  }

  @Post('admin/verify-otp')
  async verifyAdminOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.verifyAdminOtp(dto.mobile, dto.code);
    res.cookie('admin_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/'
    });
    return tokens;
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  @Post('web/refresh')
  async refreshWeb(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = dto.refreshToken ?? req.cookies?.refresh_token;
    const tokens = await this.auth.refreshTokens(refreshToken);
    this.setCustomerCookies(res, tokens);
    return tokens;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.cookie('admin_token', '', { httpOnly: true, expires: new Date(0), path: '/' });
    return { success: true };
  }

  @Post('web/logout')
  logoutWeb(@Res({ passthrough: true }) res: Response) {
    res.cookie('access_token', '', { httpOnly: true, expires: new Date(0), path: '/' });
    res.cookie('refresh_token', '', { httpOnly: true, expires: new Date(0), path: '/' });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { userId: string }) {
    return this.auth.getProfile(user.userId);
  }
}
