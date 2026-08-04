import { IsDateString, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTodoDto {
  @IsString()
  @MinLength(1, { message: "할 일 이름은 최소 1자 이상이어야 합니다." })
  @MaxLength(20, { message: "할 일 이름은 최대 20자 이하이어야 합니다." })
  name: string;

  @IsDateString()
  targetDate: string;
}
