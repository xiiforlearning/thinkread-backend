import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { SchoolChatService } from '../../../domain/ai/school-chat.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { SchoolChatDto } from './dto';
import { AdminScopeService } from './scope';

/** The school-wide AI: the owner asks about the whole school, a teacher about their groups. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin')
export class AdminChatController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly chat: SchoolChatService,
  ) {}

  @Post('chat')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'AI over the whole school (owner) or the caller’s groups (teacher): laggards, group comparison, week totals',
  })
  async ask(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SchoolChatDto,
  ): Promise<{ text: string }> {
    const scope = await this.scope.resolve(principal);
    return this.chat.ask(
      { studentIds: await this.scope.studentIds(scope), groupIds: scope.groupIds },
      dto.question,
      dto.history ?? [],
    );
  }
}
