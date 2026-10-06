import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';
import { AdminsModule } from '../../domain/admins/admins.module';
import { GroupsModule } from '../../domain/groups/groups.module';
import { RegistrationModule } from '../../domain/students/registration.module';
import { StudentsModule } from '../../domain/students/students.module';
import { TeacherModule } from '../teacher/teacher.module';
import { BotUpdate } from './bot.update';
import { TelegramPortsModule } from './ports/telegram-ports.module';
import { BotCommandsService } from './services/bot-commands.service';
import { BotInfoService } from './services/bot-info.service';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        token: config.botToken,
        // `false` skips bot.launch(): handlers are registered but no polling starts.
        launchOptions: config.botLaunch ? undefined : false,
      }),
    }),
    TelegramPortsModule,
    GroupsModule,
    StudentsModule,
    RegistrationModule,
    AdminsModule,
    TeacherModule,
  ],
  providers: [BotInfoService, BotCommandsService, BotUpdate],
})
export class BotModule {}
