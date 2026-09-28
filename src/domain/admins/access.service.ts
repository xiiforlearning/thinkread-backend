import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../config/config.service';
import { GroupsService } from '../groups/groups.service';
import { Admin, AdminRole } from './admin.entity';

export type Role = AdminRole | 'STUDENT' | 'NONE';

/**
 * Who is who. The owner comes from ADMIN_TELEGRAM_ID (always) or the admins
 * table; teachers from the admins table or the group admin custom title
 * "teacher" (cached in groups.teacher_telegram_ids).
 */
@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(Admin)
    private readonly repo: Repository<Admin>,
    private readonly config: AppConfigService,
    private readonly groups: GroupsService,
  ) {}

  async isOwner(telegramUserId: number): Promise<boolean> {
    if (telegramUserId === this.config.adminTelegramId) return true;
    const admin = await this.repo.findOne({ where: { telegramUserId } });
    return admin?.role === AdminRole.OWNER;
  }

  /** Staff role, or null for a regular user. */
  async staffRole(telegramUserId: number): Promise<AdminRole | null> {
    if (await this.isOwner(telegramUserId)) return AdminRole.OWNER;
    const admin = await this.repo.findOne({ where: { telegramUserId } });
    if (admin) return admin.role;
    const taught = await this.groups.findActiveByTeacher(telegramUserId);
    return taught.length > 0 ? AdminRole.TEACHER : null;
  }

  /** Groups a teacher may see; null means "all" (owner). */
  async visibleGroupIds(telegramUserId: number): Promise<number[] | null> {
    if (await this.isOwner(telegramUserId)) return null;
    const taught = await this.groups.findActiveByTeacher(telegramUserId);
    return taught.map((g) => g.chatId);
  }

  /** The Telegram id that receives owner notifications (summaries, alerts). */
  get ownerTelegramId(): number {
    return this.config.adminTelegramId;
  }
}
