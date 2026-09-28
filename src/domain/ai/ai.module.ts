import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiMessage } from '../ai-log/ai-message.entity';
import { AiUsage } from '../ai-log/ai-usage.entity';
import { GroupsModule } from '../groups/groups.module';
import { NormsModule } from '../norms/norms.module';
import { StudentsModule } from '../students/students.module';
import { AgentService } from './agent.service';
import { DialogHistoryService } from './dialog-history.service';
import { AGENT_TOOLS } from './tool';
import {
  GetListeningMethodTool,
  GetProfileTool,
  MarkReminderWovenTool,
  SetMoodTool,
} from './tools/profile.tools';
import { UsageService } from './usage.service';

/** Add a tool: implement AgentTool, list it here and in the AGENT_TOOLS factory. */
const TOOL_CLASSES = [GetProfileTool, GetListeningMethodTool, SetMoodTool, MarkReminderWovenTool];

/** The LLM_PORT provider comes from infra/ai (global AnthropicModule). */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiMessage, AiUsage]),
    StudentsModule,
    GroupsModule,
    NormsModule,
  ],
  providers: [
    ...TOOL_CLASSES,
    { provide: AGENT_TOOLS, useFactory: (...tools: unknown[]) => tools, inject: TOOL_CLASSES },
    DialogHistoryService,
    UsageService,
    AgentService,
  ],
  exports: [AgentService, UsageService],
})
export class AiModule {}
