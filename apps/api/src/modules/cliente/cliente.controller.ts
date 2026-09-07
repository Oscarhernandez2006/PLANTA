import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { QueryClienteDto } from './dto/query-cliente.dto';
import { ClienteService } from './cliente.service';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClienteController {
  constructor(private readonly service: ClienteService) {}

  @Get('next-code')
  nextCode() {
    return this.service.nextCode();
  }

  @Get()
  findAll(@Query() query: QueryClienteDto) {
    return this.service.findAll(query.search);
  }

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.service.create(dto);
  }
}
