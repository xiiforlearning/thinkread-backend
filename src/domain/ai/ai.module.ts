import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiMessage } from '../ai-log/ai-message.entity';
import { AiUsage } from '../ai-log/ai-usage.entity';
import { FlagsModule } from '../flags/flags.module';
import { GroupsModule } from '../groups/groups.module';
import { NormsModule } from '../norms/norms.module';
import { ReportsModule } from '../reports/reports.module';
import { StudentsModule } from '../students/students.module';
import { WordsModule } from '../words/words.module';
import { AgentService } from './agent.service';
import { AuthenticityService } from './authenticity.service';
import { EnrichmentService } from './enrichment.service';
import { ReportIntakeService } from './report-intake.service';
import { SpotCheckGraderService } from './spot-check-grader.service';
import { DialogHistoryService } from './dialog-history.service';
import { AGENT_TOOLS } from './tool';
import {
  GetListeningMethodTool,
  GetProfileTool,
  MarkReminderWovenTool,
  SetMoodTool,
} from './tools/profile.tools';
import {
  GetProgressTool,
  RecordSpotCheckAnswerTool,
  SaveListeningReportTool,
  SaveReadingReportTool,
} from './tools/report.tools';
import {
  AddRecommendedWordsTool,
  AddWordsTool,
  ExportVocabularyTool,
  GetRecommendedWordsTool,
  GetVocabularySummaryTool,
  SearchVocabularyTool,
  SetWordPriorityTool,
  SetWordStatusTool,
} from './tools/vocabulary.tools';
import { UsageService } from './usage.service';

/** Add a tool: implement AgentTool and list it here (the AGENT_TOOLS factory picks it up). */
export const TOOL_CLASSES = [
  GetProfileTool,
  GetListeningMethodTool,
  SetMoodTool,
  MarkReminderWovenTool,
  SaveReadingReportTool,
  SaveListeningReportTool,
  GetProgressTool,
  RecordSpotCheckAnswerTool,
  AddWordsTool,
  SearchVocabularyTool,
  GetVocabularySummaryTool,
  SetWordStatusTool,
  SetWordPriorityTool,
  ExportVocabularyTool,
  GetRecommendedWordsTool,
  AddRecommendedWordsTool,
];

/** The LLM_PORT provider comes from infra/ai (global AnthropicModule). */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiMessage, AiUsage]),
    StudentsModule,
    GroupsModule,
    NormsModule,
    ReportsModule,
    FlagsModule,
    WordsModule,
  ],
  providers: [
    ...TOOL_CLASSES,
    { provide: AGENT_TOOLS, useFactory: (...tools: unknown[]) => tools, inject: TOOL_CLASSES },
    DialogHistoryService,
    UsageService,
    AuthenticityService,
    EnrichmentService,
    ReportIntakeService,
    SpotCheckGraderService,
    AgentService,
  ],
  exports: [
    AgentService,
    UsageService,
    AuthenticityService,
    EnrichmentService,
    ReportIntakeService,
    SpotCheckGraderService,
  ],
})
export class AiModule {}
