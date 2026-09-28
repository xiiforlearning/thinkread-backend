import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../groups/group.entity';
import { GroupsService } from '../groups/groups.service';
import { GroupLevel, highestLevel } from '../groups/level';
import { Student } from '../students/student.entity';
import { ArchiveReason, StudentStatus } from '../students/student.enums';
import { StudentsService } from '../students/students.service';
import { MembershipCheck, MembershipCheckDetails } from './membership-check.entity';
import { MEMBERSHIP_PORT, MembershipPort } from './membership.port';

export interface UserMembership {
  /** Active groups the user is a member of. */
  memberOf: Group[];
  /** Groups the bot could not query — unknown, never treated as "left". */
  failedGroups: Group[];
  level: GroupLevel | null;
}

export interface CheckOutcome {
  student: Student;
  action: 'kept' | 'archived' | 'restored';
  levelChanged: boolean;
  failedGroups: Group[];
}

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @Inject(MEMBERSHIP_PORT) private readonly telegram: MembershipPort,
    @InjectRepository(MembershipCheck)
    private readonly checks: Repository<MembershipCheck>,
    private readonly groups: GroupsService,
    private readonly students: StudentsService,
  ) {}

  /** Which active groups a Telegram user belongs to (one getChatMember per group). */
  async lookup(telegramUserId: number, activeGroups?: Group[]): Promise<UserMembership> {
    const groups = activeGroups ?? (await this.groups.findAllActive());
    const memberOf: Group[] = [];
    const failedGroups: Group[] = [];
    for (const group of groups) {
      const status = await this.telegram.getMemberStatus(group.chatId, telegramUserId);
      if (status === 'member') memberOf.push(group);
      else if (status === 'error') failedGroups.push(group);
    }
    return { memberOf, failedGroups, level: highestLevel(memberOf.map((g) => g.level)) };
  }

  /**
   * Re-check one student and apply the outcome: archive if in no group,
   * restore if back, recompute the cached level. For a group the bot could not
   * query the previous membership is kept. Students added by hand are never
   * archived automatically.
   */
  async reconcile(student: Student, activeGroups?: Group[]): Promise<CheckOutcome> {
    const { memberOf, failedGroups } = await this.lookup(student.telegramUserId, activeGroups);

    if (failedGroups.length > 0) {
      const previous = await this.students.memberGroupIds(student.id);
      memberOf.push(...failedGroups.filter((g) => previous.includes(g.chatId)));
    }
    await this.students.syncGroups(
      student.id,
      memberOf.map((g) => g.chatId),
    );

    const level = highestLevel(memberOf.map((g) => g.level));
    const levelChanged = level !== student.level;
    if (levelChanged) {
      await this.students.setLevel(student.id, level);
      student.level = level;
    }

    const hasAccess = memberOf.length > 0 || student.manualAccess;
    const leftGroup =
      student.status === StudentStatus.ARCHIVED &&
      student.archiveReason === ArchiveReason.LEFT_GROUP;

    if (!hasAccess && student.status !== StudentStatus.ARCHIVED) {
      const archived = await this.students.archive(student, ArchiveReason.LEFT_GROUP);
      return { student: archived, action: 'archived', levelChanged, failedGroups };
    }
    if (hasAccess && leftGroup) {
      const restored = await this.students.restore(student);
      return { student: restored, action: 'restored', levelChanged, failedGroups };
    }
    return { student, action: 'kept', levelChanged, failedGroups };
  }

  /** The monthly run over every relevant student. An error on one student never stops the run. */
  async runCheck(): Promise<MembershipCheck> {
    const run = await this.checks.save(this.checks.create({ startedAt: new Date() }));
    const details: MembershipCheckDetails = {
      archived: [],
      restored: [],
      levelChanged: [],
      failedGroups: [],
    };
    const failed = new Set<number>();
    const activeGroups = await this.groups.findAllActive();
    const students = await this.students.findForMembershipCheck();

    let checked = 0;
    for (const student of students) {
      try {
        const outcome = await this.reconcile(student, activeGroups);
        checked += 1;
        if (outcome.action === 'archived') details.archived.push(student.id);
        if (outcome.action === 'restored') details.restored.push(student.id);
        if (outcome.levelChanged) details.levelChanged.push(student.id);
        outcome.failedGroups.forEach((g) => failed.add(g.chatId));
      } catch (err) {
        this.logger.warn(
          `membership check failed for student ${student.id}: ${(err as Error).message}`,
        );
      }
    }
    details.failedGroups = [...failed];

    run.finishedAt = new Date();
    run.checked = checked;
    run.archived = details.archived.length;
    run.restored = details.restored.length;
    run.levelChanged = details.levelChanged.length;
    run.details = details;
    return this.checks.save(run);
  }

  latest(limit = 12): Promise<MembershipCheck[]> {
    return this.checks.find({ order: { startedAt: 'DESC' }, take: limit });
  }
}
