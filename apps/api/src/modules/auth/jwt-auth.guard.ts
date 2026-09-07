import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthContext } from '../../common/auth/auth-context';

interface JwtPayload {
  sub: string;
  plantId: string;
  role: AuthContext['role'];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { authContext?: AuthContext }>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sesión requerida.');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      req.authContext = {
        userId: payload.sub,
        plantId: payload.plantId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
  }
}
