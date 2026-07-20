import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { PeriodType } from "../../common/date";
import { WorkType } from "../../entities/challenge.entity";

export class UpdateChallengeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(PeriodType)
  recurrenceType?: PeriodType;

  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @IsOptional()
  @IsInt()
  targetCount?: number;

  @IsOptional()
  @IsInt()
  dailyMaxCount?: number;

  @IsOptional()
  @IsInt()
  point?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
