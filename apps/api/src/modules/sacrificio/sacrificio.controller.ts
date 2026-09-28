import {
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
  ) {
    return this.service.stunNext(user, id);
  }

  @Post(':id/undo')
  undo(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.undoLast(user, id);
  }
}
