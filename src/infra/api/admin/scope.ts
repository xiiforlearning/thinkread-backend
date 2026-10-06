import { Injectable } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AccessService } from '../../../domain/admins/access.service';
import { Group } from '../../../domain/groups/group.entity';
import { GroupsService } from '../../../domain/groups/groups.service';
import { Student } from '../../../domain/students/student.entity';
import { StudentStatus } from '../../../domain/students/student.enums';
import { StudentsService } from '../../../domain/students/students.service';
import { Principal } from '../auth/principal';

/**
 * What a staff member may see. The owner sees everything (`groupIds` null);
 * a teacher sees the active groups they teach and the students in them.
 */
export interface AdminScope {
  principal: Principal;
  isOwner: boolean;
  groupIds: number[] | null;
}

@Injectable()
export class AdminScopeService {
  constructor(
    private readonly access: AccessService,
    private readonly students: StudentsService,
    private readonly groups: GroupsService,
  ) {}

  async resolve(principal: Principal): Promise<AdminScope> {
    const groupIds = await this.access.visibleGroupIds(principal.telegramUserId);
    return { principal, isOwner: groupIds === null, groupIds };
  }

  async visibleGroups(scope: AdminScope): Promise<Group[]> {
    const all = await this.groups.findAllActive();
    return scope.groupIds === null ? all : all.filter((g) => scope.groupIds?.includes(g.chatId));
  }

  /** Students the caller may see, optionally by status (default: not archived). */
  async visibleStudents(scope: AdminScope, statuses?: StudentStatus[]): Promise<Student[]> {
    const wanted = statuses ?? [StudentStatus.ACTIVE, StudentStatus.PENDING_NAME];
    if (scope.groupIds === null) return this.students.findAll({ statuses: wanted });
    const members = await this.students.findByGroups(scope.groupIds);
    return members
      .filter((s) => wanted.includes(s.status))
      .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime());
  }

  /** Ids of every student in scope (any status) — for teacher-limited queries; null = everyone. */
  async studentIds(scope: AdminScope): Promise<string[] | null> {
    if (scope.groupIds === null) return null;
    const members = await this.students.findByGroups(scope.groupIds);
    return members.map((s) => s.id);
  }

  /** Loads a student the caller may see, or 404 / 403. */
  async student(scope: AdminScope, id: string): Promise<Student> {
    const student = await this.students.getById(id);
    if (scope.groupIds !== null) {
      const groups = await this.students.memberGroupIds(student.id);
      if (!groups.some((g) => scope.groupIds?.includes(g))) throw forbidden();
    }
    return student;
  }

  assertGroup(scope: AdminScope, chatId: number): void {
    if (scope.groupIds !== null && !scope.groupIds.includes(chatId)) throw forbidden();
  }

  assertOwner(scope: AdminScope): void {
    if (!scope.isOwner) throw forbidden();
  }
}

export function forbidden(): AppError {
  return new AppError({
    level: ErrorLevel.LOW_BUSINESS,
    service: ServiceCode.AUTH,
    error: ErrorCode.FORBIDDEN,
  });
}
