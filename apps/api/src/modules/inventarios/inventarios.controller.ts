import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventariosService } from './inventarios.service';

@UseGuards(JwtAuthGuard)
@Controller('inventarios')
export class InventariosController {
  constructor(private readonly service: InventariosService) {}

  @Get('cavas/:cava')
  cava(
    @CurrentUser() user: AuthContext,
    @Param('cava') cava: string,
    @Query('date') date?: string,
  ) {
    return this.service.cava(user, cava, date);
  }

  @Get('cavas-subproducto/:cava')
  cavaSubproducto(
    @CurrentUser() user: AuthContext,
    @Param('cava') cava: string,
    @Query('date') date?: string,
  ) {
    return this.service.cavaSubproducto(user, cava, date);
  }
}
