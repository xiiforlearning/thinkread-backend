import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './group.entity';
import { GroupLevel } from './level';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly repo: Repository<Group>,
  ) {}

  /**
   * Called when the bot is added to a group. Anyone can add a public bot to any chat, so an
   * unknown group is created inactive — pending the owner's approval (`approve()`, the level
   * buttons in the owner's DM). A known group the owner approved before (it has a level) comes
   * back active by itself; one that was never approved stays pending.
   */
  async upsert(chatId: number, title: string): Promise<Group> {
    const existing = await this.repo.findOne({ where: { chatId } });
    if (existing) {
      existing.title = title;
      existing.isActive = existing.level !== null;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ chatId, title, isActive: false, level: null }));
  }

  /** The owner approved the group (and set its level): it joins the school. */
  async approve(chatId: number, level: GroupLevel): Promise<void> {
    await this.repo.update({ chatId }, { level, isActive: true });
  }

  /** Owner: bring a deactivated group back without changing its level. */
  async activate(chatId: number): Promise<void> {
    await this.repo.update({ chatId }, { isActive: true });
  }

  findById(chatId: number): Promise<Group | null> {
    return this.repo.findOne({ where: { chatId } });
  }

  findAllActive(): Promise<Group[]> {
    return this.repo.find({ where: { isActive: true }, order: { title: 'ASC' } });
  }

  async deactivate(chatId: number): Promise<void> {
    await this.repo.update({ chatId }, { isActive: false });
  }

  async setLevel(chatId: number, level: GroupLevel): Promise<void> {
    await this.repo.update({ chatId }, { level });
  }

  async updateTeachers(chatId: number, ids: number[]): Promise<void> {
    await this.repo.update(
      { chatId },
      { teacherTelegramIds: ids, teachersRefreshedAt: new Date() },
    );
  }

  /** Active groups where the given user is in teacher_telegram_ids. */
  findActiveByTeacher(telegramUserId: number): Promise<Group[]> {
    return this.repo
      .createQueryBuilder('g')
      .where('g.is_active = TRUE')
      .andWhere('g.teacher_telegram_ids @> :id::jsonb', { id: JSON.stringify(telegramUserId) })
      .getMany();
  }
}
