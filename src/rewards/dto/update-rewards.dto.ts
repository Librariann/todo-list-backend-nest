import {
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
} from "class-validator";
import { RewardType } from "../../entities/reward.entity";

export class UpdateRewardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RewardType)
  type?: RewardType;

  @IsOptional()
  @IsInt()
  point?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  discount?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountRate?: number;
}
