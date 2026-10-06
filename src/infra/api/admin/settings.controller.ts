import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fromZonedTime } from 'date-fns-tz';
import { AppConfigService } from '../../../config/config.service';
import { AccessService } from '../../../domain/admins/access.service';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { UsageService } from '../../../domain/ai/usage.service';
import { EDITABLE_SETTINGS, SettingsService } from '../../../domain/settings/settings.service';
import { displayNameOf } from '../../../domain/students/name-validation';
import { StudentsService } from '../../../domain/students/students.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { SettingsPatchDto, StaffDto, UsageQueryDto } from './dto';
import { AdminScopeService } from './scope';
import { staffView } from './serializers';

/** 15 · Настройки — owner only: norms and thresholds, staff, AI spend. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER)
@Controller('admin')
export class AdminSettingsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly settings: SettingsService,
    private readonly access: AccessService,
    private readonly usage: UsageService,
    private readonly students: StudentsService,
    private readonly config: AppConfigService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Editable settings with current value, code default and whether overridden',
  })
  async all(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return { keys: Object.keys(EDITABLE_SETTINGS), settings: await this.settings.all() };
  }

  @Patch('settings')
  @ApiOperation({
    summary:
      'Change settings: { values: { "norms.readingPerWeek": 4 } } — applied at once everywhere',
  })
  async patch(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SettingsPatchDto,
  ): Promise<Record<string, unknown>> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return { settings: await this.settings.update(dto.values) };
  }

  @Delete('settings/:key')
  @ApiOperation({ summary: 'Reset one setting to its code default' })
  async reset(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
  ): Promise<Record<string, unknown>> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return { settings: await this.settings.reset(key) };
  }

  @Get('staff')
  @ApiOperation({
    summary: 'Teachers and admins: explicit grants plus teachers detected from group admin titles',
  })
  async staff(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>[]> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    return (await this.access.listStaff()).map(staffView);
  }

  @Post('staff')
  @ApiOperation({ summary: 'Grant TEACHER (default) or OWNER to a Telegram user id' })
  async grant(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: StaffDto,
  ): Promise<Record<string, unknown>[]> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    await this.access.grant(
      dto.telegramUserId,
      dto.role ?? AdminRole.TEACHER,
      dto.name?.trim() || null,
    );
    return (await this.access.listStaff()).map(staffView);
  }

  @Delete('staff/:telegramUserId')
  @ApiOperation({ summary: 'Revoke an explicit grant (a group-title teacher keeps that access)' })
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('telegramUserId', ParseIntPipe) telegramUserId: number,
  ): Promise<Record<string, unknown>[]> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    await this.access.revoke(telegramUserId);
    return (await this.access.listStaff()).map(staffView);
  }

  @Get('ai-usage')
  @ApiOperation({
    summary: 'AI spend for a month (default: current): totals, by purpose, top students',
  })
  async aiUsage(
    @CurrentPrincipal() principal: Principal,
    @Query() q: UsageQueryDto,
  ): Promise<Record<string, unknown>> {
    this.scope.assertOwner(await this.scope.resolve(principal));
    const tz = this.config.timezone;
    const month =
      q.month ??
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(
        new Date(),
      );
    const [y, m] = month.split('-').map(Number);
    const from = fromZonedTime(`${month}-01T00:00:00`, tz);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const to = fromZonedTime(`${next}-01T00:00:00`, tz);
    const report = await this.usage.report(from, to, 5);
    const students = await this.students.findAll({
      ids: report.topStudents.map((s) => s.studentId),
    });
    const name = new Map(students.map((s) => [s.id, displayNameOf(s)]));
    const activeCount = (await this.students.countByStatus()).ACTIVE;
    return {
      month,
      ...report,
      perActiveStudentUsd:
        activeCount > 0 ? Math.round((report.costUsd / activeCount) * 100) / 100 : 0,
      topStudents: report.topStudents.map((s) => ({ ...s, name: name.get(s.studentId) ?? null })),
    };
  }
}
