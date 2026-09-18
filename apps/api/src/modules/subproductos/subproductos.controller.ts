import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubproductosService } from './subproductos.service';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';
import { AsignarCavaDto } from './dto/asignar-cava.dto';

@UseGuards(JwtAuthGuard)
@Controller('subproductos')
export class SubproductosController {
  constructor(private readonly service: SubproductosService) {}

  @Get('lotes')
  lotes(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.lotes(user, date);
  }

  @Get('grupo')
  grupoDetail(
    @CurrentUser() user: AuthContext,
    @Query('cliente') cliente: string,
    @Query('date') date?: string,
  ) {
    return this.service.grupoDetail(user, cliente, date);
  }

  @Patch('grupo/cava')
  asignarCava(
    @CurrentUser() user: AuthContext,
    @Body() dto: AsignarCavaDto,
  ) {
    return this.service.asignarCava(
      user,
      dto.ordenBeneficioIds,
      dto.cava,
      dto.categoria,
    );
  }

  @Post()
  registrar(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegistrarSubproductoDto,
  ) {
    return this.service.registrar(user, dto);
  }
}
