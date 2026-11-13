import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryTallerDto } from './dto/query-taller.dto';
import { TalleresService } from './talleres.service';
import { HistorialService } from './historial.service';

@UseGuards(JwtAuthGuard)
@Controller('talleres')
export class TalleresController {
  constructor(
    private readonly service: TalleresService,
    private readonly historialService: HistorialService,
  ) {}

  @Get('desposte')
  desposte(@CurrentUser() user: AuthContext, @Query() q: QueryTallerDto) {
    return this.service.desposte(user, q.desde, q.hasta);
  }

  @Get('acondicionamiento')
  acondicionamiento(@CurrentUser() user: AuthContext, @Query() q: QueryTallerDto) {
    return this.service.acondicionamiento(user, q.desde, q.hasta, q.margen);
  }

  @Get('historial')
  historial(@CurrentUser() user: AuthContext, @Query() q: QueryTallerDto) {
    return this.historialService.historial(user, q.desde, q.hasta);
  }
}
