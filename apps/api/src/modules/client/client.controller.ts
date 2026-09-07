import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientService } from './client.service';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly service: ClientService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
