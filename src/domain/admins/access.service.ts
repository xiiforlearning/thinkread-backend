import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../config/config.service';
import { GroupsService } from '../groups/groups.service';
import { Admin, AdminRole } from './admin.entity';

export type Role = AdminRole | 'STUDENT' | 'NONE';

export interface StaffMember {
  telegramUserId: number;
  name: string | null;
  role: AdminRole;
  /** Explicit row in `admins` (vs. detected from a group admin title only). */
  granted: boolean;
  groups: Array<{ chatId: number; title: string }>;
}

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

  /**
   * Everyone with a staff role besides the env owner: rows of the admins
   * table plus teachers detected from the group admin title, with the groups
   * each one teaches.
   */
  async listStaff(): Promise<StaffMember[]> {
    const [admins, groups] = await Promise.all([this.repo.find(), this.groups.findAllActive()]);
    const byId = new Map<number, StaffMember>();
    for (const a of admins) {
      byId.set(a.telegramUserId, {
        telegramUserId: a.telegramUserId,
        name: a.name,
        role: a.role,
        granted: true,
        groups: [],
      });
    }
    for (const g of groups) {
      for (const id of g.teacherTelegramIds) {
        const row = byId.get(id) ?? {
          telegramUserId: id,
          name: null,
          role: AdminRole.TEACHER,
          granted: false,
          groups: [],
        };
        row.groups.push({ chatId: g.chatId, title: g.title });
        byId.set(id, row);
      }
    }
    return [...byId.values()].filter((s) => s.telegramUserId !== this.config.adminTelegramId);
  }

  /** Grant (or rename) an explicit staff role. The env owner cannot be changed. */
  async grant(telegramUserId: number, role: AdminRole, name: string | null): Promise<void> {
    if (telegramUserId === this.config.adminTelegramId) return;
    await this.repo.save(this.repo.create({ telegramUserId, role, name }));
  }

  /** Drop an explicit grant; a teacher detected from a group title keeps that access. */
  async revoke(telegramUserId: number): Promise<void> {
    if (telegramUserId === this.config.adminTelegramId) return;
    await this.repo.delete({ telegramUserId });
  }

  /** The Telegram id that receives owner notifications (summaries, alerts). */
  get ownerTelegramId(): number {
    return this.config.adminTelegramId;
  }
}
