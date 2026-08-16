import { IsInt } from "class-validator";

export class PointInputDto {
  @IsInt()
  id: string;

  @IsInt()
  point: number;
}
