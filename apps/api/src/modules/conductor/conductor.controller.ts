import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateConductorDto } from './dto/create-conductor.dto';
import { QueryConductorDto } from './dto/query-conductor.dto';
import { ConductorService } from './conductor.service';

@UseGuards(JwtAuthGuard)
@Controller('conductores')
export class ConductorController {
  constructor(private readonly service: ConductorService) {}

  @Get('next-code')
  nextCode() {
    return this.service.nextCode();
  }

  @Get()
  findAll(@Query() query: QueryConductorDto) {
    return this.service.findAll(query.search);
  }

  @Post()
  create(@Body() dto: CreateConductorDto) {
    return this.service.create(dto);
  }
}
