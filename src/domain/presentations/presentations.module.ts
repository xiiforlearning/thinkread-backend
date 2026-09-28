import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Presentation } from './presentation.entity';
import { PresentationsService } from './presentations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Presentation])],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
