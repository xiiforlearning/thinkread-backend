import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { AccessStatus } from '../../../domain/students/registration.service';
import { Student } from '../../../domain/students/student.entity';

export type ApiRole = 'STUDENT' | AdminRole;

/** What a verified JWT says about the caller. */
export interface Principal {
  telegramUserId: number;
  studentId: string | null;
  status: AccessStatus | null;
  roles: ApiRole[];
}

export interface RequestWithPrincipal extends Request {
  principal?: Principal;
  student?: Student;
}

export const ROLES_KEY = 'api:roles';
export const Roles = (...roles: ApiRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export const ALLOW_PENDING_KEY = 'api:allowPending';
/** Endpoints a PENDING_NAME student may call (only /me/register). */
export const AllowPendingName = (): MethodDecorator => SetMetadata(ALLOW_PENDING_KEY, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return req.principal as Principal;
  },
);

export const CurrentStudent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Student => {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return req.student as Student;
  },
);
