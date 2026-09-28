import { Module } from '@nestjs/common';
import { MembershipModule } from '../membership/membership.module';
import { RegistrationService } from './registration.service';
import { StudentsModule } from './students.module';

@Module({
  imports: [StudentsModule, MembershipModule],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
