import { IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
