import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { GroupLevel } from '../groups/level';
import { StudentGroup } from './student-group.entity';
import { Student } from './student.entity';
import { ArchiveReason, DialogState, StudentKind, StudentStatus } from './student.enums';

export interface CreateStudentInput {
  telegramUserId: number;
  username: string | null;
  /** Groups the student is a member of right now. */
  groupChatIds: number[];
  level: GroupLevel | null;
  /** Added by hand by the owner (no membership required). */
  manualAccess?: boolean;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
    @InjectRepository(StudentGroup)
    private readonly groupsRepo: Repository<StudentGroup>,
  ) {}

  findByTelegramId(telegramUserId: number): Promise<Student | null> {
    return this.repo.findOne({ where: { telegramUserId } });
  }

  findById(id: string): Promise<Student | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getById(id: string): Promise<Student> {
    const student = await this.findById(id);
    if (!student) {
      throw new AppError({
        level: ErrorLevel.LOW_BUSINESS,
        service: ServiceCode.STUDENTS,
        error: ErrorCode.NOT_FOUND,
        meta: { id },
      });
    }
    return student;
  }

  /** Students the monthly membership check looks at: active, or archived because they left a group. */
  findForMembershipCheck(): Promise<Student[]> {
    return this.repo.find({
      where: [
        { status: StudentStatus.ACTIVE },
        { status: StudentStatus.PENDING_NAME },
        { status: StudentStatus.ARCHIVED, archiveReason: ArchiveReason.LEFT_GROUP },
      ],
      order: { registeredAt: 'ASC' },
    });
  }

  findActive(): Promise<Student[]> {
    return this.repo.find({ where: { status: StudentStatus.ACTIVE, dmBlocked: false } });
  }

  async create(input: CreateStudentInput): Promise<Student> {
    const student = await this.repo.save(
      this.repo.create({
        telegramUserId: input.telegramUserId,
        username: input.username,
        kind: StudentKind.STUDENT,
        status: StudentStatus.PENDING_NAME,
        level: input.level,
        manualAccess: input.manualAccess ?? false,
        dialogState: {},
        lastActivityAt: new Date(),
      }),
    );
    await this.syncGroups(student.id, input.groupChatIds);
    return student;
  }

  async setName(student: Student, firstName: string, lastName: string): Promise<Student> {
    student.firstName = firstName;
    student.lastName = lastName;
    if (student.status === StudentStatus.PENDING_NAME) student.status = StudentStatus.ACTIVE;
    return this.repo.save(student);
  }

  async setDisplayName(id: string, displayName: string | null): Promise<void> {
    await this.repo.update({ id }, { displayName });
  }

  async setLevel(id: string, level: GroupLevel | null): Promise<void> {
    await this.repo.update({ id }, { level });
  }

  async archive(student: Student, reason: ArchiveReason): Promise<Student> {
    if (student.status === StudentStatus.ARCHIVED) return student;
    student.status = StudentStatus.ARCHIVED;
    student.archiveReason = reason;
    student.archivedAt = new Date();
    return this.repo.save(student);
  }

  /** Data is restored as-is; a student who never gave a name goes back to PENDING_NAME. */
  async restore(student: Student): Promise<Student> {
    if (student.status !== StudentStatus.ARCHIVED) return student;
    student.status = student.firstName ? StudentStatus.ACTIVE : StudentStatus.PENDING_NAME;
    student.archiveReason = null;
    student.archivedAt = null;
    return this.repo.save(student);
  }

  async touchActivity(id: string): Promise<void> {
    await this.repo.update({ id }, { lastActivityAt: new Date(), username: undefined });
  }

  async updateUsername(id: string, username: string | null): Promise<void> {
    await this.repo.update({ id }, { username });
  }

  async patchDialogState(student: Student, patch: Partial<DialogState>): Promise<Student> {
    student.dialogState = { ...student.dialogState, ...patch };
    return this.repo.save(student);
  }

  async markDmBlocked(telegramUserId: number): Promise<void> {
    await this.repo.update({ telegramUserId }, { dmBlocked: true });
  }

  /** Any incoming DM proves the student hasn't blocked the bot. */
  async clearDmBlockedByTelegramId(telegramUserId: number): Promise<void> {
    await this.repo.update({ telegramUserId, dmBlocked: true }, { dmBlocked: false });
  }

  // --- group links -----------------------------------------------------------

  /** Chat ids of the groups the student is currently a member of. */
  async memberGroupIds(studentId: string): Promise<number[]> {
    const rows = await this.groupsRepo.find({ where: { studentId, isMember: true } });
    return rows.map((r) => r.groupChatId);
  }

  /**
   * Record which groups the student is in right now. Groups not in `memberOf`
   * are kept with `is_member = false` (history), new ones are inserted.
   */
  async syncGroups(studentId: string, memberOf: number[]): Promise<void> {
    const now = new Date();
    const existing = await this.groupsRepo.find({ where: { studentId } });
    const known = new Set(existing.map((r) => r.groupChatId));

    for (const row of existing) {
      const isMember = memberOf.includes(row.groupChatId);
      if (isMember && !row.isMember) row.joinedAt = now;
      row.isMember = isMember;
      row.checkedAt = now;
    }
    const added = memberOf
      .filter((chatId) => !known.has(chatId))
      .map((groupChatId) =>
        this.groupsRepo.create({
          studentId,
          groupChatId,
          isMember: true,
          joinedAt: now,
          checkedAt: now,
        }),
      );
    await this.groupsRepo.save([...existing, ...added]);
  }

  /** Active member links for a set of groups — used by teacher scoping. */
  async findByGroups(groupChatIds: number[]): Promise<Student[]> {
    if (groupChatIds.length === 0) return [];
    const links = await this.groupsRepo.find({
      where: { groupChatId: In(groupChatIds), isMember: true },
    });
    const ids = [...new Set(links.map((l) => l.studentId))];
    return ids.length === 0 ? [] : this.repo.find({ where: { id: In(ids) } });
  }
}
