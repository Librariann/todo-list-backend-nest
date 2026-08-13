import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateHabitDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyTarget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}
