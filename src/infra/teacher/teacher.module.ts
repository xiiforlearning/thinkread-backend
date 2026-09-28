import { Module } from '@nestjs/common';
import { GroupsModule } from '../../domain/groups/groups.module';
import { TeacherResolverService } from './teacher-resolver.service';

@Module({
  imports: [GroupsModule],
  providers: [TeacherResolverService],
  exports: [TeacherResolverService],
})
export class TeacherModule {}
