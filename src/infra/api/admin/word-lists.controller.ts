import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, ErrorLevel, ServiceCode } from '../../../common/codes';
import { AppError } from '../../../common/errors';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { GroupsService } from '../../../domain/groups/groups.service';
import { parseWordList } from '../../../domain/words/normalize';
import { WordList } from '../../../domain/words/word-list.entity';
import { WordListsService } from '../../../domain/words/word-lists.service';
import { WordListScope } from '../../../domain/words/word.enums';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentPrincipal, Principal, Roles } from '../auth/principal';
import { CreateWordListDto, PatchWordListDto } from './dto';
import { AdminScope, AdminScopeService, forbidden } from './scope';
import { GroupRef, wordListView } from './serializers';

/** 14 · Группы → списки слов от учителя, with coverage per list. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(AdminRole.OWNER, AdminRole.TEACHER)
@Controller('admin/word-lists')
export class AdminWordListsController {
  constructor(
    private readonly scope: AdminScopeService,
    private readonly lists: WordListsService,
    private readonly groups: GroupsService,
  ) {}

  private async groupRef(chatId: number | null): Promise<GroupRef | null> {
    if (chatId === null) return null;
    const g = await this.groups.findById(chatId);
    return g ? { chatId: g.chatId, title: g.title } : { chatId, title: String(chatId) };
  }

  /** A teacher sees lists for their groups, their own lists, and school-wide ones. */
  private visible(scope: AdminScope, l: WordList): boolean {
    if (scope.isOwner) return true;
    if (l.createdBy === scope.principal.telegramUserId) return true;
    if (l.scope === WordListScope.GROUP)
      return l.groupChatId !== null && (scope.groupIds ?? []).includes(l.groupChatId);
    return true;
  }

  private async view(l: WordList, withItems: boolean): Promise<Record<string, unknown>> {
    const [group, coverage, items] = await Promise.all([
      this.groupRef(l.groupChatId),
      this.lists.coverage(l),
      withItems ? this.lists.itemsOf(l.id) : Promise.resolve(undefined),
    ]);
    return wordListView(l, group, coverage, items);
  }

  @Get()
  @ApiOperation({
    summary: 'Teacher word lists in scope with coverage (addressed / added / learned / hidden)',
  })
  async list(@CurrentPrincipal() principal: Principal): Promise<Record<string, unknown>[]> {
    const scope = await this.scope.resolve(principal);
    const all = (await this.lists.findAll()).filter((l) => this.visible(scope, l));
    return Promise.all(all.map((l) => this.view(l, false)));
  }

  @Post()
  @ApiOperation({
    summary: 'Create a list from free text (word — translation, one per line or comma-separated)',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateWordListDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    if (dto.scope === WordListScope.GROUP) {
      if (dto.groupChatId === undefined)
        throw badRequest('groupChatId is required for scope GROUP');
      this.scope.assertGroup(scope, dto.groupChatId);
    }
    if (dto.scope === WordListScope.LEVEL && !dto.level)
      throw badRequest('level is required for scope LEVEL');
    if (dto.scope !== WordListScope.GROUP && !scope.isOwner) throw forbidden();
    const items = parseWordList(dto.text);
    if (items.length === 0) throw badRequest('no words found in text');
    const list = await this.lists.create({
      title: dto.title,
      scope: dto.scope,
      groupChatId: dto.groupChatId ?? null,
      level: dto.level ?? null,
      createdBy: principal.telegramUserId,
      items,
    });
    return this.view(list, true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One list with its items and coverage' })
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const list = await this.lists.getById(id);
    if (!this.visible(scope, list)) throw forbidden();
    return this.view(list, true);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, close / reopen, or replace the words of a list' })
  async patch(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchWordListDto,
  ): Promise<Record<string, unknown>> {
    const scope = await this.scope.resolve(principal);
    const list = await this.lists.getById(id);
    if (!this.visible(scope, list)) throw forbidden();
    if (!scope.isOwner && list.createdBy !== principal.telegramUserId) throw forbidden();
    if (dto.title) await this.lists.setTitle(list.id, dto.title);
    if (dto.status) await this.lists.setStatus(list.id, dto.status);
    if (dto.text) {
      const items = parseWordList(dto.text);
      if (items.length === 0) throw badRequest('no words found in text');
      await this.lists.replaceItems(list.id, items);
    }
    return this.view(await this.lists.getById(id), true);
  }
}

function badRequest(message: string): AppError {
  return new AppError({
    level: ErrorLevel.LOW_VALIDATION,
    service: ServiceCode.WORDS,
    error: ErrorCode.BAD_REQUEST,
    message,
  });
}
