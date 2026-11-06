import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Audience, Principal, Role } from './auth.types';

export const PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const AUDIENCE_KEY = 'audience';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/**
 * Who may call a route. Routes without it are staff-only, so a parent or student
 * token can never reach staff routes by accident.
 */
export const ForAudience = (...audience: Audience[]) => SetMetadata(AUDIENCE_KEY, audience);
/** School leadership: can set up the school and see every class. */
export const LEADERSHIP: Role[] = ['proprietor', 'admin'];

/** The logged-in user. Its shape depends on the route's audience: Principal, ParentPrincipal or StudentPrincipal. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().user,
);
