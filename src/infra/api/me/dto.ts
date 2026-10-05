import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReportType } from '../../../domain/reports/report.entity';
import { CefrLevel, WordPriority, WordSource, WordStatus } from '../../../domain/words/word.enums';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(30) firstName!: string;
  @IsString() @MinLength(2) @MaxLength(60) lastName!: string;
}

export class CalmModeDto {
  @IsBoolean() on!: boolean;
}

export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}

export class CalendarQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(52) weeks?: number;
}

export class WordsQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(WordStatus) status?: WordStatus;
  @IsOptional() @IsEnum(CefrLevel) cefr?: CefrLevel;
  @IsOptional() @IsEnum(WordSource) source?: WordSource;
  @IsOptional() @IsEnum(WordPriority) priority?: WordPriority;
}

export class NewWordDto {
  @IsString() @MinLength(1) @MaxLength(100) word!: string;
  @IsOptional() @IsString() @MaxLength(200) translation?: string | null;
}

export class AddWordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => NewWordDto)
  words!: NewWordDto[];
}

export class ImportTextDto {
  @IsString() @MinLength(1) @MaxLength(50_000) text!: string;
}

export class ConfirmImportDto {
  @IsOptional() @IsArray() @IsString({ each: true }) excludeWords?: string[];
}

export class PatchWordDto {
  @IsOptional() @IsString() @MaxLength(200) translation?: string;
  @IsOptional() @IsEnum(WordStatus) status?: WordStatus;
}

export class PriorityDto {
  @IsEnum(WordPriority) priority!: WordPriority;
}

export class ExportQueryDto {
  @IsIn(['csv', 'txt']) format!: 'csv' | 'txt';
}

export class SubmitReportDto {
  @IsEnum(ReportType) type!: ReportType;
  @IsString() @MinLength(5) @MaxLength(5000) text!: string;
}

export class ClarifyDto {
  @IsString() @MinLength(1) @MaxLength(5000) text!: string;
}

export class PatchReportDto {
  @IsOptional() @IsString() @MaxLength(200) sourceTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) episode?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2000) pages?: number;
  @IsOptional() @IsString() @MaxLength(3000) summary?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) firstPassPct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) secondPassPct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) listenCount?: number;
}

export class RecommendationIdsDto {
  @IsOptional() @IsBoolean() all?: boolean;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) itemIds?: string[];
}

export class SpotCheckAnswerDto {
  @IsOptional() @IsString() @MaxLength(1000) answer?: string | null;
}
