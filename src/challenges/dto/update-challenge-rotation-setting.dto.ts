import { IsInt, Max, Min } from "class-validator";

export class UpdateChallengeRotationSettingDto {
  @IsInt()
  @Min(1)
  @Max(50)
  selectionCount: number;

  @IsInt()
  @Min(0)
  @Max(30)
  cooldownPeriods: number;
}
