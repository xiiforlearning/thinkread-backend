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

  /** Called when the bot is added to a group; keeps the level if the group is known. */
  async upsert(chatId: number, title: string): Promise<Group> {
    const existing = await this.repo.findOne({ where: { chatId } });
    if (existing) {
      existing.title = title;
      existing.isActive = true;
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ chatId, title, isActive: true, level: null }));
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
