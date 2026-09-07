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
import { SavePesoCamionDto } from './dto/save-peso-camion.dto';
import { QueryPesoCamionDto } from './dto/query-peso-camion.dto';
import { PesoCamionService } from './peso-camion.service';

@UseGuards(JwtAuthGuard)
@Controller('peso-camion')
export class PesoCamionController {
  constructor(private readonly service: PesoCamionService) {}

  @Get('next-reference')
  nextReference(
    @CurrentUser() user: AuthContext,
    @Query('date') date?: string,
  ) {
    return this.service.nextReference(user, date);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: SavePesoCamionDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthContext,
    @Query() query: QueryPesoCamionDto,
  ) {
    return this.service.findAll(user, query.status);
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
    @Body() dto: SavePesoCamionDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Patch(':id/close')
  close(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.close(user, id);
  }
}
