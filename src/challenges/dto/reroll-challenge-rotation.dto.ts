import { ArrayUnique, IsArray, IsInt } from "class-validator";

export class RerollChallengeRotationDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  challengeIds: number[];
}
