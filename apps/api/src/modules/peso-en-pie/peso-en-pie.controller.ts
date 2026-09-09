import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SavePesoEnPieDto } from './dto/save-peso-en-pie.dto';
import { QueryPesoEnPieDto } from './dto/query-peso-en-pie.dto';
import { PesoEnPieService } from './peso-en-pie.service';

@UseGuards(JwtAuthGuard)
@Controller('peso-en-pie')
export class PesoEnPieController {
  constructor(private readonly service: PesoEnPieService) {}

  @Get('next-reference')
  nextReference(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.nextReference(user, date);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: SavePesoEnPieDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryPesoEnPieDto) {
    return this.service.findAll(user, query.status);
  }

  @Patch('close-guide')
  closeGuide(
    @CurrentUser() user: AuthContext,
    @Query('date') date: string,
    @Query('guia') guia: string,
  ) {
    return this.service.closeGuide(user, date, guia);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePesoEnPieDto,
  ) {
    return this.service.update(user, id, dto);
  }
}
