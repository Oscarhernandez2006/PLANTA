import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProcedenciaDto } from './dto/create-procedencia.dto';
import { QueryProcedenciaDto } from './dto/query-procedencia.dto';
import { ProcedenciaService } from './procedencia.service';

@UseGuards(JwtAuthGuard)
@Controller('procedencias')
export class ProcedenciaController {
  constructor(private readonly service: ProcedenciaService) {}

  @Get()
  findAll(@Query() query: QueryProcedenciaDto) {
    return this.service.findAll(query.search);
  }

  @Post()
  create(@Body() dto: CreateProcedenciaDto) {
    return this.service.create(dto);
  }
}
