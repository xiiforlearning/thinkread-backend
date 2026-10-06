import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServiceCode } from '../../common/codes';
import { AppConfigService } from '../../config/config.service';
import { globalConfig } from '../../config/global.config';
import { AccessService } from '../../domain/admins/access.service';
import { MembershipCheck } from '../../domain/membership/membership-check.entity';
import { MembershipService } from '../../domain/membership/membership.service';
import { NOTIFIER_PORT, NotifierPort } from '../../domain/notify/notifier.port';
import { displayNameOf } from '../../domain/students/name-validation';
import { StudentsService } from '../../domain/students/students.service';

@Injectable()
export class MembershipCron {
  private readonly logger = new Logger(MembershipCron.name);
  private readonly tag = `[svc=${ServiceCode.MEMBERSHIP}]`;

  constructor(
    private readonly membership: MembershipService,
    private readonly students: StudentsService,
    private readonly access: AccessService,
    private readonly config: AppConfigService,
    @Inject(NOTIFIER_PORT) private readonly notifier: NotifierPort,
  ) {}

  @Cron(globalConfig.schedule.membershipCheckCron, { timeZone: 'Asia/Tashkent' })
  async monthly(): Promise<void> {
    await this.run();
  }

  /** Also callable on demand (admin API "run now"). */
  async run(): Promise<MembershipCheck> {
    this.logger.log(`${this.tag} membership check start`);
    const result = await this.membership.runCheck();
    this.logger.log(
      `${this.tag} membership check done: checked=${result.checked} archived=${result.archived} restored=${result.restored} levelChanged=${result.levelChanged}`,
    );
    await this.notifier.sendToUser(this.access.ownerTelegramId, await this.summary(result));
    return result;
  }

  private async summary(run: MembershipCheck): Promise<string> {
    const names = async (ids: string[]): Promise<string> => {
      const list = await Promise.all(
        ids.map(async (id) => displayNameOf(await this.students.getById(id))),
      );
      return list.map((n) => `• ${n}`).join('\n');
    };
    const d = run.details;
    const lines = [`Ежемесячная сверка групп: проверено ${run.checked} студентов.`];
    if (d && d.archived.length > 0)
      lines.push('', `В архив (вышли из групп) — ${d.archived.length}:`, await names(d.archived));
    if (d && d.restored.length > 0)
      lines.push('', `Восстановлены — ${d.restored.length}:`, await names(d.restored));
    if (d && d.levelChanged.length > 0)
      lines.push('', `Сменили уровень — ${d.levelChanged.length}:`, await names(d.levelChanged));
    if (d && d.failedGroups.length > 0) {
      lines.push(
        '',
        `⚠️ Не смог проверить группы: ${d.failedGroups.join(', ')} — возможно, меня из них удалили. Их студентов не архивировал.`,
      );
    }
    if (run.archived === 0 && run.restored === 0 && run.levelChanged === 0)
      lines.push('Изменений нет.');
    return lines.join('\n');
  }
}
