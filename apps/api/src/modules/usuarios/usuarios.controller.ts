import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  listar(@CurrentUser() user: AuthContext) {
    return this.service.listar(user);
  }

  @Post()
  crear(@CurrentUser() user: AuthContext, @Body() dto: CreateUsuarioDto) {
    return this.service.crear(user, dto);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.service.actualizar(user, id, dto);
  }
}
