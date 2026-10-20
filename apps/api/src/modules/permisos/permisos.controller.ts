import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdatePermisosDto } from './dto/update-permisos.dto';
import { PermisosService } from './permisos.service';

@UseGuards(JwtAuthGuard)
@Controller('permisos')
export class PermisosController {
  constructor(private readonly service: PermisosService) {}

  @Get('usuarios')
  usuarios(@CurrentUser() user: AuthContext) {
    return this.service.usuarios(user);
  }

  @Patch('usuarios/:id')
  actualizar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermisosDto,
  ) {
    return this.service.actualizar(user, id, dto);
  }
}
