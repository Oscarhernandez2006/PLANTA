import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.service.create(dto);
  }
}
