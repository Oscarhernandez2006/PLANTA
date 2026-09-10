import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { AuthService } from './auth.service';
import { CheckCedulaDto } from './dto/check-cedula.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('check-cedula')
  checkCedula(@Body() dto: CheckCedulaDto) {
    return this.service.checkCedula(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Post('verify-admin')
  verifyAdmin(@Body() dto: LoginDto) {
    return this.service.verifyAdmin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthContext) {
    return this.service.me(user);
  }
}
