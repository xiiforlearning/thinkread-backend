import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flag } from './flag.entity';
import { FlagsService } from './flags.service';
import { SpotCheck } from './spot-check.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Flag, SpotCheck])],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}
