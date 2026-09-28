import { Injectable, Logger } from '@nestjs/common';
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
 * What the bot should do with a private message before any AI is involved.
 * - `reply`: send this text and stop (registration step, refusal, archive note)
 * - `student`: an active student — the message goes on to the dialog
 */
export type Gate = { kind: 'reply'; text: string } | { kind: 'student'; student: Student };

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly students: StudentsService,
    private readonly membership: MembershipService,
  ) {}

  /**
   * Gate every private message: unknown users are registered only if they are
   * in one of the groups; archived students are re-checked and restored on
   * return; PENDING_NAME students are asked for their name.
   */
  async gate(user: IncomingUser, text: string): Promise<Gate> {
    const existing = await this.students.findByTelegramId(user.telegramUserId);

    if (!existing) return this.register(user);

    if (existing.username !== user.username) {
      await this.students.updateUsername(existing.id, user.username);
    }

    if (existing.status === StudentStatus.ARCHIVED) {
      const { student, action } = await this.membership.reconcile(existing);
      if (action !== 'restored') return { kind: 'reply', text: studentMessages.archived };
      this.logger.log(`Student ${student.id} restored on return`);
      if (student.status === StudentStatus.PENDING_NAME) {
        return { kind: 'reply', text: `${studentMessages.restored}\n\n${studentMessages.askName}` };
      }
      return { kind: 'reply', text: studentMessages.restored };
    }

    if (existing.status === StudentStatus.PENDING_NAME) return this.acceptName(existing, text);

    await this.students.touchActivity(existing.id);
    return { kind: 'student', student: existing };
  }

  private async register(user: IncomingUser): Promise<Gate> {
    const { memberOf, level } = await this.membership.lookup(user.telegramUserId);
    if (memberOf.length === 0) {
      this.logger.log(`Registration refused for ${user.telegramUserId}: not a group member`);
      return { kind: 'reply', text: studentMessages.notAMember };
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
    return { kind: 'reply', text: studentMessages.askName };
  }

  private async acceptName(student: Student, text: string): Promise<Gate> {
    const parsed = parseFullName(text);
    if (!parsed) return { kind: 'reply', text: studentMessages.askNameAgain };
    await this.students.setName(student, parsed.firstName, parsed.lastName);
    this.logger.log(`Student ${student.id} named`);
    return { kind: 'reply', text: studentMessages.welcome(parsed.firstName) };
  }
}
