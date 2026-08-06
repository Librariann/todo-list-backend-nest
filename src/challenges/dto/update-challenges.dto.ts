import { IsInt, IsOptional, IsString } from "class-validator";
import { PeriodType } from "../../common/date";

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
  recurrenceType?: PeriodType;

  @IsOptional()
  @IsInt()
  targetCount?: number;

  @IsOptional()
  @IsInt()
  point?: number;
}
