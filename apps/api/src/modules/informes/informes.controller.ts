import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryInformeDto } from './dto/query-informe.dto';
import { InformesService } from './informes.service';

@UseGuards(JwtAuthGuard)
@Controller('informes')
export class InformesController {
  constructor(private readonly service: InformesService) {}

  @Get('canal-caliente')
  canalCaliente(@CurrentUser() user: AuthContext, @Query() query: QueryInformeDto) {
    return this.service.canalCaliente(user, query.hasta);
  }

  @Get('canal-caliente/:ordenId')
  canalCalienteDetalle(
    @CurrentUser() user: AuthContext,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
  ) {
    return this.service.canalCalienteDetalle(user, ordenId);
  }
}
