import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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
  startDate: string;

  @IsInt()
  @Min(1)
  targetCount: number;

  @IsOptional()
  isActive?: boolean;
}
