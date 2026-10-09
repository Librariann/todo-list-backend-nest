import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "할 일 이름은 최소 1자 이상이어야 합니다." })
  @MaxLength(50, { message: "할 일 이름은 최대 50자 이하이어야 합니다." })
  name?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
