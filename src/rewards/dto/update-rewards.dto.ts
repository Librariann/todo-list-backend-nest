import {
  IsBoolean,
  IsEnum,
  IsInt,
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
  discountRate?: number;
}
