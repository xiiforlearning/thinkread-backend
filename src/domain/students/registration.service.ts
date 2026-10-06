import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../common/codes';
import { AppError } from '../../common/errors';
import { MembershipService } from '../membership/membership.service';
import { studentMessages } from './messages';
import { parseFullName } from './name-validation';
import { Student } from './student.entity';
import { StudentStatus } from './student.enums';
import { StudentsService } from './students.service';

export interface IncomingUser {
  telegramUserId: number;
  username: string | null;
}

/**
 * Where a Telegram user stands with ThinkRead — the answer of `POST /auth/webapp`.
 * STAFF = owner or teacher without a student account: the Mini App sends them to the dashboard.
 */
export type AccessStatus = 'NOT_MEMBER' | 'PENDING_NAME' | 'ACTIVE' | 'ARCHIVED' | 'STAFF';

export interface Resolution {
  status: AccessStatus;
  /** Present for everything but NOT_MEMBER. */
  student: Student | null;
}

/**
 * What the bot should do with a private message before anything else.
 * - `reply`: send this text and stop (not a member, archive note, open the app)
 * - `student`: an active student
 */
export type Gate = { kind: 'reply'; text: string } | { kind: 'student'; student: Student };

/**
 * Registration and access. Since 01.10.2026 the student registers in the
 * Mini App: `resolve()` answers the auth endpoint, `setName()` finishes the
 * first login. The bot only uses `gate()` to decide what to say.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly membership: MembershipService,
  ) {}

  /**
   * Find or create the student for a Telegram user and tell their status.
   * Unknown users are created only if they are in one of the groups; archived
   * students are re-checked and restored on return.
   */
  /**
   * `staff` = the caller is the owner or a teacher: they are group admins, so the membership
   * lookup would register them as students. Without a finished student account they stay STAFF;
   * a staff member who already is an ACTIVE student keeps the student flow.
   */
  async resolve(user: IncomingUser, opts: { staff?: boolean } = {}): Promise<Resolution> {
    const existing = await this.students.findByTelegramId(user.telegramUserId);

    if (opts.staff && (!existing || existing.status === StudentStatus.PENDING_NAME))
      return { status: 'STAFF', student: existing };

    if (!existing) {
      const { memberOf, level } = await this.membership.lookup(user.telegramUserId);
      if (memberOf.length === 0) {
        this.logger.log(`Access refused for ${user.telegramUserId}: not a group member`);
        return { status: 'NOT_MEMBER', student: null };
      }
      const student = await this.students.create({
        telegramUserId: user.telegramUserId,
        username: user.username,
        groupChatIds: memberOf.map((g) => g.chatId),
        level,
      });
      this.logger.log(
        `Student ${student.id} registered in ${memberOf.length} group(s), level=${level ?? 'unset'}`,
      );
      return { status: 'PENDING_NAME', student };
    }

    if (existing.username !== user.username) {
      await this.students.updateUsername(existing.id, user.username);
      existing.username = user.username;
    }

    if (existing.status === StudentStatus.ARCHIVED) {
      const { student, action } = await this.membership.reconcile(existing);
      if (action !== 'restored') return { status: 'ARCHIVED', student };
      this.logger.log(`Student ${student.id} restored on return`);
      return { status: this.statusOf(student), student };
    }

    if (existing.status === StudentStatus.ACTIVE) await this.students.touchActivity(existing.id);
    return { status: this.statusOf(existing), student: existing };
  }

  /** First login: the real first and last name. */
  async setName(student: Student, firstName: string, lastName: string): Promise<Student> {
    const parsed = parseFullName(`${firstName.trim()} ${lastName.trim()}`);
    if (!parsed) {
      throw new AppError({
        level: ErrorLevel.LOW_VALIDATION,
        service: ServiceCode.STUDENTS,
        error: ErrorCode.NAME_INVALID,
      });
    }
    const saved = await this.students.setName(student, parsed.firstName, parsed.lastName);
    this.logger.log(`Student ${saved.id} named`);
    return saved;
  }

  /** Bot: one line per situation, pointing to the Mini App. */
  async gate(user: IncomingUser): Promise<Gate> {
    const { status, student } = await this.resolve(user);
    switch (status) {
      case 'NOT_MEMBER':
        return { kind: 'reply', text: studentMessages.notAMember };
      case 'ARCHIVED':
        return { kind: 'reply', text: studentMessages.archived };
      case 'PENDING_NAME':
        return { kind: 'reply', text: studentMessages.finishInApp };
      case 'ACTIVE':
        return { kind: 'student', student: student as Student };
      case 'STAFF':
        return { kind: 'reply', text: studentMessages.staffInApp };
    }
  }

  private statusOf(student: Student): AccessStatus {
    return student.status === StudentStatus.PENDING_NAME ? 'PENDING_NAME' : 'ACTIVE';
  }
}
