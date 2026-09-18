import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CanalTrasladoService } from './canal-traslado.service';
import { CrearTrasladoDto } from './dto/crear-traslado.dto';

@UseGuards(JwtAuthGuard)
@Controller('canal-traslado')
export class CanalTrasladoController {
  constructor(private readonly service: CanalTrasladoService) {}

  @Get('buscar')
  buscar(
    @CurrentUser() user: AuthContext,
    @Query('consecutivo') consecutivo: string,
    @Query('date') date?: string,
  ) {
    return this.service.buscarPorConsecutivo(user, consecutivo, date);
  }

  @Post()
  trasladar(@CurrentUser() user: AuthContext, @Body() dto: CrearTrasladoDto) {
    return this.service.trasladar(user, dto);
  }

  @Get()
  historial(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.historial(user, date);
  }
}
