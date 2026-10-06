import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AdminRole } from '../../../domain/admins/admin.entity';
import { FlagKind, FlagStatus } from '../../../domain/flags/flag.enums';
import { GroupLevel } from '../../../domain/groups/level';
import { StudentStatus } from '../../../domain/students/student.enums';
import { WordListScope, WordListStatus } from '../../../domain/words/word.enums';

export class OverviewQueryDto {
  @IsOptional() @IsIn(['this', 'last']) week?: 'this' | 'last';
}

export class StudentsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['good', 'warn', 'bad']) health?: 'good' | 'warn' | 'bad';
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @IsOptional() @Type(() => Number) @IsInt() groupChatId?: number;
}

export class RenameStudentDto {
  /** Owner's label shown everywhere instead of the name; null clears it. */
  @IsOptional() @IsString() @MaxLength(80) displayName?: string | null;
}

export class FlagsQueryDto {
  @IsOptional() @IsEnum(FlagStatus) status?: FlagStatus;
  @IsOptional() @IsEnum(FlagKind) kind?: FlagKind;
  @IsOptional() @IsUUID('4') studentId?: string;
}

export class ReviewFlagDto {
  @IsIn([FlagStatus.REVIEWED, FlagStatus.DISMISSED]) status!:
    | FlagStatus.REVIEWED
    | FlagStatus.DISMISSED;
}

export class GroupLevelDto {
  @IsEnum(GroupLevel) level!: GroupLevel;
}

export class CreateWordListDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsEnum(WordListScope) scope!: WordListScope;
  @IsOptional() @Type(() => Number) @IsInt() groupChatId?: number;
  @IsOptional() @IsEnum(GroupLevel) level?: GroupLevel;
  /** Free text: one word per line, "word — translation", commas, numbering. */
  @IsString() @MinLength(1) @MaxLength(50_000) text!: string;
}

export class PatchWordListDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) title?: string;
  @IsOptional() @IsEnum(WordListStatus) status?: WordListStatus;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50_000) text?: string;
}

export class SettingsPatchDto {
  /** `{ "norms.readingPerWeek": 4, ... }` — keys from EDITABLE_SETTINGS. */
  @IsObject() values!: Record<string, unknown>;
}

export class StaffDto {
  @Type(() => Number) @IsInt() telegramUserId!: number;
  @IsOptional() @IsEnum(AdminRole) role?: AdminRole;
  @IsOptional() @IsString() @MaxLength(80) name?: string | null;
}

export class UsageQueryDto {
  /** `YYYY-MM`; default — the current month. */
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

export class ChatTurnDto {
  @IsIn(['teacher', 'ai']) role!: 'teacher' | 'ai';
  @IsString() @MaxLength(4000) text!: string;
}

export class TeacherChatDto {
  @IsString() @MinLength(1) @MaxLength(1000) question!: string;
  /** Previous turns of this conversation (the dashboard keeps them; nothing is stored). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

export class ParentReportDto {
  /** `YYYY-MM`; default — the current month. */
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

export class RunRemindersDto {
  @IsIn(['CARDS', 'REPORTS']) kind!: 'CARDS' | 'REPORTS';
}
