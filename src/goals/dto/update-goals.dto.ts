import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
