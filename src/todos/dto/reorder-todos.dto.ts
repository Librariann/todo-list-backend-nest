import { IsArray, IsDateString } from "class-validator";

export class ReorderTodoDto {
  @IsArray()
  indexIds: Array<{ id: number }>;

  @IsDateString()
  targetDate: string;
}
