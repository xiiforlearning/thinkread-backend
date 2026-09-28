import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { AccessService } from './access.service';
import { Admin } from './admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin]), GroupsModule],
  providers: [AccessService],
  exports: [AccessService],
})
export class AdminsModule {}
