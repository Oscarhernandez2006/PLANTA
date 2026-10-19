import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SacrificioService } from './sacrificio.service';
import { StunDto } from './dto/stun.dto';
import { UndoDto } from './dto/undo.dto';

@UseGuards(JwtAuthGuard)
@Controller('sacrificio')
export class SacrificioController {
  constructor(private readonly service: SacrificioService) {}

  @Get()
  pendientes(@CurrentUser() user: AuthContext) {
    return this.service.pendientes(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Post(':id/stun')
  stun(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StunDto,
  ) {
    return this.service.stunNext(user, id, dto.sequence);
  }

  @Post(':id/undo')
  undo(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UndoDto,
  ) {
    return this.service.undoLast(user, id, dto.pin);
  }
}
