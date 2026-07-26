import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PeriodType } from "src/common/date";

export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PeriodType)
  recurrenceType: PeriodType;

  @IsInt()
  @Min(1)
  interval: number;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "목표 시작일은 YYYY-MM-DD 형식이어야 합니다.",
  })
  startDate: string;

  @IsInt()
  @Min(1)
  targetCount: number;

  @IsOptional()
  isActive?: boolean;
}
