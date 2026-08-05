import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PeriodType } from "../../common/date";
import { WorkType } from "../../entities/challenge.entity";

export class CreateChallengeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsEnum(PeriodType)
  recurrenceType: PeriodType;

  @IsInt()
  targetCount: number;

  @IsInt()
  dailyMaxCount: number;

  @IsEnum(WorkType)
  workType: WorkType;

  @IsInt()
  point: number;

  @IsBoolean()
  isActive: boolean;
}
