import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateHabitDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsInt()
  @Min(1)
  dailyTarget: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;
}
