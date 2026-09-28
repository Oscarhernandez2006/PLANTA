import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActualizarConservacionDto } from './dto/actualizar-conservacion.dto';
import { AsignarProductoDto } from './dto/asignar-producto.dto';
import { ConservacionService } from './conservacion.service';

@UseGuards(JwtAuthGuard)
@Controller('conservacion')
export class ConservacionController {
  constructor(private readonly service: ConservacionService) {}

  @Get('clientes')
  clientes(@CurrentUser() user: AuthContext) {
    return this.service.clientes(user);
  }

  @Get('clientes/:clienteId/productos')
  productos(
    @CurrentUser() user: AuthContext,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ) {
    return this.service.productos(user, clienteId);
  }

  @Post('clientes/:clienteId/productos')
  asignar(
    @CurrentUser() user: AuthContext,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() dto: AsignarProductoDto,
  ) {
    return this.service.asignar(user, clienteId, dto);
  }

  @Patch('clientes/:clienteId/productos/:productId')
  actualizar(
    @CurrentUser() user: AuthContext,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ActualizarConservacionDto,
  ) {
    return this.service.actualizar(user, clienteId, productId, dto);
  }

  @Delete('clientes/:clienteId/productos/:productId')
  quitar(
    @CurrentUser() user: AuthContext,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.service.quitar(user, clienteId, productId);
  }
}
