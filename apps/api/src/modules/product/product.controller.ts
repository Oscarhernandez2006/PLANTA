import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryProductDto } from './dto/query-product.dto';
import { ProductService } from './product.service';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryProductDto) {
    return this.service.findAll(user, query.search);
  }
}
