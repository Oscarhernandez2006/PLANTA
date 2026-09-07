import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { QueryProveedorDto } from './dto/query-proveedor.dto';
import { ProveedorService } from './proveedor.service';

@UseGuards(JwtAuthGuard)
@Controller('proveedores')
export class ProveedorController {
  constructor(private readonly service: ProveedorService) {}

  @Get('next-code')
  nextCode() {
    return this.service.nextCode();
  }

  @Get()
  findAll(@Query() query: QueryProveedorDto) {
    return this.service.findAll(query.search);
  }

  @Post()
  create(@Body() dto: CreateProveedorDto) {
    return this.service.create(dto);
  }
}
