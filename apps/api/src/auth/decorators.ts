import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Principal, Role } from './auth.types';

export const PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** School leadership: can set up the school and see every class. */
export const LEADERSHIP: Role[] = ['proprietor', 'admin'];

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().user,
);
