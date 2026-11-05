import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Audience, Role, TokenRole } from './auth.types';
import { AUDIENCE_KEY, PUBLIC_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: { sub: string; school: string; role: TokenRole };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }

    const audience: Audience = payload.role === 'parent' ? 'parent' : payload.role === 'student' ? 'student' : 'staff';
    const allowed = this.reflector.getAllAndOverride<Audience[] | undefined>(AUDIENCE_KEY, targets) ?? ['staff'];
    if (!allowed.includes(audience)) throw new ForbiddenException('This account cannot use this page');

    if (audience === 'parent') req.user = { guardianId: payload.sub, schoolId: payload.school, role: 'parent' };
    else if (audience === 'student') req.user = { studentId: payload.sub, schoolId: payload.school, role: 'student' };
    else req.user = { staffId: payload.sub, schoolId: payload.school, role: payload.role };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && (audience !== 'staff' || !roles.includes(payload.role as Role))) {
      throw new ForbiddenException('Your role cannot do this');
    }
    return true;
  }
}
