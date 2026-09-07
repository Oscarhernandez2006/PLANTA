import { UserRole } from '@prisma/client';

export interface AuthContext {
  userId: string;
  plantId: string;
  role: UserRole;
}
