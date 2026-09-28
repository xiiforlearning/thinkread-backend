import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { GroupsModule } from '../../domain/groups/groups.module';
import { StudentsModule } from '../../domain/students/students.module';
import { TeacherModule } from '../teacher/teacher.module';
import { BotUpdate } from './bot.update';
import { BotCommandsService } from './services/bot-commands.service';
import { BotInfoService } from './services/bot-info.service';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        token: config.botToken,
      }),
    }),
    GroupsModule,
    StudentsModule,
    TeacherModule,
  ],
  providers: [BotInfoService, BotCommandsService, BotUpdate],
})
export class BotModule {}
