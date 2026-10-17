import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { AccessService } from './access.service';
import { Admin } from './admin.entity';
import { LoginCodesService } from './login-codes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Admin]), GroupsModule],
  providers: [AccessService, LoginCodesService],
  exports: [AccessService, LoginCodesService],
})
export class AdminsModule {}
