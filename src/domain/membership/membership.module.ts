import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsModule } from '../groups/groups.module';
import { StudentsModule } from '../students/students.module';
import { MembershipCheck } from './membership-check.entity';
import { MembershipService } from './membership.service';

/** The MEMBERSHIP_PORT provider is supplied by the bot module (infra) at app level. */
@Module({
  imports: [TypeOrmModule.forFeature([MembershipCheck]), GroupsModule, StudentsModule],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
