import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from './auth-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const req = context
      .switchToHttp()
      .getRequest<{ authContext: AuthContext }>();
    return req.authContext;
  },
);
