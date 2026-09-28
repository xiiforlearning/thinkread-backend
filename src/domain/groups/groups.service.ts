import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './group.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly repo: Repository<Group>,
  ) {}

  async upsert(chatId: number, title: string): Promise<Group> {
    const existing = await this.repo.findOne({ where: { chatId } });
    if (existing) {
      existing.title = title;
      existing.isActive = true;
      return this.repo.save(existing);
    }
    const created = this.repo.create({ chatId, title, isActive: true });
    return this.repo.save(created);
  }

  findById(chatId: number): Promise<Group | null> {
    return this.repo.findOne({ where: { chatId } });
  }

  findAllActive(): Promise<Group[]> {
    return this.repo.find({ where: { isActive: true } });
  }

  async deactivate(chatId: number): Promise<void> {
    await this.repo.update({ chatId }, { isActive: false });
  }

  async updateMorningTime(chatId: number, time: string): Promise<void> {
    await this.repo.update({ chatId }, { morningTime: time });
  }

  async updateEveningTime(chatId: number, time: string): Promise<void> {
    await this.repo.update({ chatId }, { eveningTime: time });
  }

  async updateTeachers(chatId: number, ids: number[]): Promise<void> {
    await this.repo.update(
      { chatId },
      { teacherTelegramIds: ids, teachersRefreshedAt: new Date() },
    );
  }

  /** Toggle whether the weekly report is also posted publicly in the group chat. */
  async setGroupReports(chatId: number, enabled: boolean): Promise<void> {
    await this.repo.update({ chatId }, { groupReportsEnabled: enabled });
  }

  /** Record the Friday of the last class week posted publicly (weekly report idempotency guard). */
  async setLastWeeklyReportOn(chatId: number, friday: string): Promise<void> {
    await this.repo.update({ chatId }, { lastWeeklyReportOn: friday });
  }

  /** Active groups where the given user is in teacher_telegram_ids. */
  async findActiveByTeacher(telegramUserId: number): Promise<Group[]> {
    return this.repo
      .createQueryBuilder('g')
      .where('g.is_active = TRUE')
      .andWhere('g.teacher_telegram_ids @> :id::jsonb', {
        id: JSON.stringify(telegramUserId),
      })
      .getMany();
  }
}
