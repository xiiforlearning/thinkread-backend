import type Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { globalConfig } from '../../config/global.config';
import { AiMessage, AiMessageRole } from '../ai-log/ai-message.entity';

/**
 * Dialog history for the model's context: the last N turns within a time
 * window. Only user text and the assistant's final text are stored — no
 * tool_use / tool_result blocks — so a replayed history is always valid and
 * cheap. Tool calls are visible in ai_usage and the domain tables instead.
 */
@Injectable()
export class DialogHistoryService {
  constructor(
    @InjectRepository(AiMessage)
    private readonly repo: Repository<AiMessage>,
  ) {}

  async recent(studentId: string, now = new Date()): Promise<Anthropic.MessageParam[]> {
    const since = new Date(now.getTime() - globalConfig.ai.contextWindowHours * 3_600_000);
    const rows = await this.repo.find({
      where: { studentId, createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
      take: globalConfig.ai.contextMessages,
    });
    return rows.reverse().map((r) => ({ role: r.role, content: r.content as string }));
  }

  async append(studentId: string, role: AiMessageRole, text: string): Promise<void> {
    await this.repo.save(this.repo.create({ studentId, role, content: text }));
  }
}
