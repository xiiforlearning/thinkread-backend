import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { AuthService } from './auth.service';
import { ALLOW_PENDING_KEY, ApiRole, RequestWithPrincipal, ROLES_KEY } from './principal';

function deny(
  error:
    | typeof ErrorCode.UNAUTHORIZED
    | typeof ErrorCode.FORBIDDEN
    | typeof ErrorCode.STUDENT_ARCHIVED,
): AppError {
  return new AppError({ level: ErrorLevel.LOW_BUSINESS, service: ServiceCode.AUTH, error });
}

/** Bearer JWT → `req.principal`; then role check if the handler declares roles. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw deny(ErrorCode.UNAUTHORIZED);
    req.principal = await this.auth.verify(token);

    const roles = this.reflector.getAllAndOverride<ApiRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && roles.length > 0 && !roles.some((r) => req.principal?.roles.includes(r))) {
      throw deny(ErrorCode.FORBIDDEN);
    }
    return true;
  }
}

/** For /me/*: loads the student behind the token; ACTIVE only unless the handler allows PENDING_NAME. */
@Injectable()
export class StudentGuard implements CanActivate {
  constructor(
    private readonly students: StudentsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    const id = req.principal?.studentId;
    if (!id) throw deny(ErrorCode.FORBIDDEN);
    const student = await this.students.findById(id);
    if (!student) throw deny(ErrorCode.FORBIDDEN);
    if (student.status === StudentStatus.ARCHIVED) throw deny(ErrorCode.STUDENT_ARCHIVED);
    const allowPending = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (student.status === StudentStatus.PENDING_NAME && !allowPending)
      throw deny(ErrorCode.FORBIDDEN);
    req.student = student;
    return true;
  }
}
