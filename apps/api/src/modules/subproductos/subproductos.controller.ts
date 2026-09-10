import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubproductosService } from './subproductos.service';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';

@UseGuards(JwtAuthGuard)
@Controller('subproductos')
export class SubproductosController {
  constructor(private readonly service: SubproductosService) {}

  @Get('lotes')
  lotes(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.lotes(user, date);
  }

  @Get('lotes/:id')
  loteDetail(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.loteDetail(user, id);
  }

  @Post()
  registrar(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegistrarSubproductoDto,
  ) {
    return this.service.registrar(user, dto);
  }
}
